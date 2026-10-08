import { Injectable, computed, inject, makeEnvironmentProviders, signal } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { Router } from '@angular/router';
import type { CanActivateFn } from '@angular/router';
import {
  AbstractSecurityStorage,
  DefaultLocalStorageService,
  DefaultSessionStorageService,
  LogLevel,
  OidcSecurityService,
  StsConfigLoader,
  StsConfigStaticLoader,
  provideAuth,
} from 'angular-auth-oidc-client';
import type { LoginResponse, OpenIdConfiguration } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../config/app-config';
import type { AppConfig } from '../config/app-config';
import { APP_URL_SCHEME, NATIVE_AUTH_BRIDGE } from '../native/native-auth-bridge';

/** Vuelta del proveedor a la app Android tras iniciar o cerrar sesión (LF-68). */
export const APP_LOGIN_CALLBACK = `${APP_URL_SCHEME}:/callback`;
export const APP_LOGOUT_CALLBACK = `${APP_URL_SCHEME}:/logout`;

/** Página que se pidió antes de ir al inicio de sesión (LF-86). */
const RETURN_PATH_KEY = 'logicflows.volver-tras-iniciar-sesion';

/**
 * Inicios de sesión seguidos sin conseguir sesión (LF-118). Si Keycloak
 * devuelve el código pero el visor no obtiene la sesión, por ejemplo porque el
 * token se rechaza por un reloj desajustado, Keycloak devolvería otro código
 * al instante y el visor entraría en un bucle de redirecciones.
 */
const LOGIN_ATTEMPTS_KEY = 'logicflows.intentos-de-inicio-de-sesion';
/** Dos intentos: el de LF-92 (una vuelta ya usada) y uno más. */
const MAX_LOGIN_ATTEMPTS = 2;
const LOGIN_ATTEMPTS_WINDOW_MS = 120_000;

/**
 * La ruta si es del propio visor: empieza por una sola barra, sin barras
 * invertidas ni esquema. Evita que el retorno lleve a otro sitio.
 */
export function safeReturnPath(value: string | null): string | null {
  if (value === null || value.length > 512 || !value.startsWith('/')) {
    return null;
  }
  if (value.startsWith('//') || value.includes('\\') || /^\/[a-z][a-z0-9+.-]*:/i.test(value)) {
    return null;
  }
  return value;
}

/** Parámetros con los que el proveedor vuelve tras iniciar sesión (RFC 6749 y OpenID Connect). */
const AUTH_RESPONSE_PARAMS = [
  'code',
  'state',
  'session_state',
  'iss',
  'error',
  'error_description',
  'error_uri',
];

/**
 * La ruta sin la vuelta del proveedor (`?code=…&state=…`), o la misma ruta si
 * no la lleva. Una vuelta solo se puede procesar una vez (LF-92).
 */
export function withoutAuthResponse(path: string): string {
  const url = new URL(path, 'http://visor.invalid');
  if (!url.searchParams.has('state')) {
    return path;
  }
  for (const name of AUTH_RESPONSE_PARAMS) {
    url.searchParams.delete(name);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Última URL de arranque ya usada para iniciar sesión: no se reutiliza. */
const HANDLED_LAUNCH_URL_KEY = 'logicflows.inicio-de-sesion';

/**
 * Configuración OpenID Connect del visor (ADR-0009): Authorization Code con
 * PKCE como cliente público, token de acceso de vida corta renovado con un
 * token de refresco, y el token solo en las peticiones a la API. En la app
 * Android, el proveedor vuelve por el esquema propio de la app (LF-68).
 */
export function openIdConfiguration(
  config: AppConfig,
  origin: string,
  native = false,
): OpenIdConfiguration {
  if (config.auth === null) {
    // Sin inicio de sesión: la librería necesita una configuración, pero no se usa.
    return { authority: origin, clientId: 'sin-autenticacion', secureRoutes: [] };
  }
  return {
    authority: config.auth.issuer,
    clientId: config.auth.clientId,
    redirectUrl: native ? APP_LOGIN_CALLBACK : `${origin}/cells`,
    postLogoutRedirectUri: native ? APP_LOGOUT_CALLBACK : origin,
    scope: 'openid profile',
    responseType: 'code',
    useRefreshToken: true,
    silentRenew: true,
    renewTimeBeforeTokenExpiresInSeconds: 30,
    ignoreNonceAfterRefresh: true,
    secureRoutes: [config.apiUrl],
    logLevel: LogLevel.Warn,
    // Tras volver del proveedor, la librería no navega por su cuenta (iría a
    // «/»): la guarda de la ruta lleva a la página que se pidió (LF-86).
    triggerAuthorizationResultEvent: true,
  };
}

/**
 * Proveedores del inicio de sesión. La configuración se lee de `config.json`.
 * En el navegador, el estado del inicio de sesión y los tokens viven en
 * `sessionStorage`. En la app, en el almacenamiento local, privado de la app:
 * Android puede cerrarla mientras el inicio de sesión está en el navegador, y
 * al volver hace falta el verificador PKCE (LF-75).
 */
export function provideVisorAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuth({
      loader: {
        provide: StsConfigLoader,
        useFactory: () =>
          new StsConfigStaticLoader(
            openIdConfiguration(
              inject(AppConfigService).config,
              window.location.origin,
              inject(NATIVE_AUTH_BRIDGE).native,
            ),
          ),
      },
    }),
    // Después de provideAuth, para sustituir su almacenamiento por defecto.
    {
      provide: AbstractSecurityStorage,
      useFactory: () =>
        inject(NATIVE_AUTH_BRIDGE).native
          ? new DefaultLocalStorageService()
          : new DefaultSessionStorageService(),
    },
  ]);
}

/** Roles del realm en el token de acceso de Keycloak (`realm_access.roles`). */
export function rolesOf(payload: unknown): string[] {
  const roles = (payload as { realm_access?: { roles?: unknown } } | null)?.realm_access?.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === 'string')
    : [];
}

/** Sesión del usuario del visor. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly #config = inject(AppConfigService);
  readonly #oidc = inject(OidcSecurityService);
  readonly #native = inject(NATIVE_AUTH_BRIDGE);
  readonly #userName = signal<string | null>(null);
  readonly #roles = signal<readonly string[]>([]);
  readonly #problem = signal<string | null>(null);
  #session: Promise<boolean> | undefined;
  /** En la app, la sesión se resuelve cuando el proveedor vuelve a ella. */
  #pendingLogin: ((authenticated: boolean) => void) | undefined;

  /** Nombre del usuario con sesión, para mostrarlo en el menú. */
  readonly userName = this.#userName.asReadonly();

  /**
   * Si el usuario puede reconocer alarmas (`operator` o `admin`, ADR-0022).
   * Solo decide si se ofrece el botón: quien autoriza es la API.
   */
  readonly canAcknowledge = computed(() =>
    this.#roles().some((role) => role === 'operator' || role === 'admin'),
  );

  /** Si el usuario administra la planta, como el calendario de turnos (ADR-0021). */
  readonly canAdminister = computed(() => this.#roles().includes('admin'));

  /**
   * Por qué no se puede comprobar la sesión: sin conexión o sin respuesta del
   * proveedor. Mientras tanto no se redirige a ninguna parte.
   */
  readonly problem = this.#problem.asReadonly();

  constructor() {
    if (this.#native.native && this.enabled) {
      this.#native.onAppUrlOpen((url) => {
        void this.#onAppUrlOpen(url);
      });
      this.#native.onSystemBrowserClosed(() => {
        // Se cerró el navegador sin volver con una sesión: se ofrece reintentar.
        if (this.#pendingLogin !== undefined) {
          this.#problem.set('No se completó el inicio de sesión.');
        }
      });
    }
  }

  get enabled(): boolean {
    return this.#config.config.auth !== null;
  }

  /**
   * Comprueba la sesión, también al volver del proveedor tras iniciarla. Sin
   * sesión redirige al inicio de sesión y devuelve `false`. Se evalúa una vez.
   */
  ensureSession(requestedPath?: string): Promise<boolean> {
    this.#session ??= this.#checkSession(requestedPath);
    return this.#session;
  }

  /**
   * La página que se pidió antes de iniciar sesión, si era otra (LF-86). Se
   * devuelve una sola vez.
   */
  takeReturnPath(): string | null {
    try {
      const path = safeReturnPath(sessionStorage.getItem(RETURN_PATH_KEY));
      sessionStorage.removeItem(RETURN_PATH_KEY);
      return path;
    } catch {
      return null;
    }
  }

  #rememberReturnPath(path: string | undefined): void {
    const checked = safeReturnPath(path ?? null);
    const safe = checked === null ? null : withoutAuthResponse(checked);
    try {
      if (safe === null) {
        sessionStorage.removeItem(RETURN_PATH_KEY);
      } else {
        sessionStorage.setItem(RETURN_PATH_KEY, safe);
      }
    } catch {
      // Sin almacenamiento, tras iniciar sesión se vuelve a la página principal.
    }
  }

  async accessToken(): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }
    const token = await firstValueFrom(this.#oidc.getAccessToken());
    return token === '' ? null : token;
  }

  logout(): void {
    if (this.#native.native) {
      this.#oidc.logoff(undefined, { urlHandler: this.#openInSystemBrowser }).subscribe();
      return;
    }
    this.#oidc.logoff().subscribe();
  }

  async #checkSession(requestedPath?: string): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }
    // Sin conexión, redirigir al proveedor mostraría una página de error del navegador.
    if (!navigator.onLine) {
      this.#problem.set('Sin conexión: el visor necesita conexión para mostrar datos en directo.');
      this.#retryWhenOnline();
      return false;
    }
    const callback = await this.#pendingLaunchCallback();
    let result;
    try {
      result = await this.#checkAuth(callback);
    } catch (error) {
      console.error('Inicio de sesión: no se pudo comprobar la sesión.', error);
      this.#problem.set('No se pudo comprobar la sesión.');
      this.#retryWhenOnline();
      return false;
    }
    if (result.isAuthenticated) {
      this.#acceptSession(result.userData);
      return true;
    }
    // El componente raíz comprueba la sesión antes que la guarda de la ruta:
    // sin ruta, se toma la dirección actual.
    this.#rememberReturnPath(
      requestedPath ?? (this.#native.native ? undefined : `${location.pathname}${location.search}`),
    );
    if (!(await this.#providerReachable())) {
      this.#problem.set('No se puede contactar con el servicio de inicio de sesión.');
      this.#retryWhenOnline();
      return false;
    }
    if (this.#native.native) {
      return new Promise<boolean>((resolve) => {
        this.#pendingLogin = resolve;
        this.#oidc.authorize(undefined, { urlHandler: this.#openInSystemBrowser });
      });
    }
    if (!this.#countLoginAttempt()) {
      this.#problem.set('No se pudo completar el inicio de sesión.');
      const path = `${location.pathname}${location.search}${location.hash}`;
      const clean = withoutAuthResponse(path);
      if (clean !== path) {
        history.replaceState(history.state, '', clean);
      }
      return false;
    }
    this.#oidc.authorize();
    return false;
  }

  /**
   * «Reintentar» tras un inicio de sesión que no se completó: vuelve a
   * empezar, sin el límite de intentos.
   */
  retryLogin(): void {
    this.#forgetLoginAttempts();
    window.location.reload();
  }

  /**
   * Anota un intento de inicio de sesión. Devuelve `false` si ya van
   * demasiados seguidos sin sesión: en lugar de redirigir otra vez, se avisa.
   */
  #countLoginAttempt(now = Date.now()): boolean {
    try {
      const stored = JSON.parse(sessionStorage.getItem(LOGIN_ATTEMPTS_KEY) ?? 'null') as {
        count?: unknown;
        since?: unknown;
      } | null;
      const since = typeof stored?.since === 'number' ? stored.since : now;
      const recent = now - since < LOGIN_ATTEMPTS_WINDOW_MS;
      const count = recent && typeof stored?.count === 'number' ? stored.count : 0;
      if (count >= MAX_LOGIN_ATTEMPTS) {
        return false;
      }
      sessionStorage.setItem(
        LOGIN_ATTEMPTS_KEY,
        JSON.stringify({ count: count + 1, since: recent ? since : now }),
      );
    } catch {
      // Sin almacenamiento no se puede contar: se redirige como siempre.
    }
    return true;
  }

  #forgetLoginAttempts(): void {
    try {
      sessionStorage.removeItem(LOGIN_ATTEMPTS_KEY);
    } catch {
      // Sin almacenamiento no hay nada que olvidar.
    }
  }

  /**
   * Comprueba la sesión; si la app arrancó con la vuelta de Keycloak, la
   * completa con ella. Una vuelta que no corresponde a ningún inicio de sesión
   * en curso en esta pestaña (ya usada, al pulsar «atrás» o abrirla desde el
   * historial) la rechaza la librería sin consultar la red. Se descarta y se
   * comprueba sin ella: la sesión que hubiera sigue valiendo y, si no hay
   * ninguna, se inicia otra (LF-92).
   */
  async #checkAuth(callback: string | undefined): Promise<LoginResponse> {
    const path = `${location.pathname}${location.search}${location.hash}`;
    try {
      return await firstValueFrom(
        callback === undefined ? this.#oidc.checkAuth() : this.#oidc.checkAuth(callback),
      );
    } catch (error) {
      const clean = withoutAuthResponse(path);
      if (callback === undefined && clean === path) {
        throw error;
      }
      console.warn(
        'Inicio de sesión: se descarta una vuelta del proveedor que no corresponde a ningún inicio de sesión en curso.',
        error,
      );
      if (clean !== path) {
        history.replaceState(history.state, '', clean);
      }
      return firstValueFrom(this.#oidc.checkAuth());
    }
  }

  /**
   * Si la librería no puede descargar la configuración del proveedor al
   * iniciar sesión, no redirige ni avisa, y el visor se queda en blanco. Se
   * descarga antes para poder indicarlo y ofrecer reintentar (LF-92).
   */
  async #providerReachable(): Promise<boolean> {
    try {
      await firstValueFrom(this.#oidc.preloadAuthWellKnownDocument());
      return true;
    } catch (error) {
      console.error(
        'Inicio de sesión: no se pudo descargar la configuración del proveedor de identidad.',
        error,
      );
      return false;
    }
  }

  /**
   * La vuelta de Keycloak con la que arrancó la app, si Android la cerró
   * mientras el inicio de sesión estaba en el navegador (LF-75). Cada URL se
   * usa una sola vez: recargar la vista web no cambia la URL de arranque.
   */
  async #pendingLaunchCallback(): Promise<string | undefined> {
    if (!this.#native.native) {
      return undefined;
    }
    const url = await this.#native.launchUrl();
    if (!url?.startsWith(APP_LOGIN_CALLBACK)) {
      return undefined;
    }
    if (localStorage.getItem(HANDLED_LAUNCH_URL_KEY) === url) {
      return undefined;
    }
    localStorage.setItem(HANDLED_LAUNCH_URL_KEY, url);
    await this.#native.closeSystemBrowser();
    return url;
  }

  readonly #openInSystemBrowser = (url: string): void => {
    void this.#native.openInSystemBrowser(url);
  };

  /** Vuelta del proveedor a la app: completa el inicio de sesión o el cierre. */
  async #onAppUrlOpen(url: string): Promise<void> {
    if (url.startsWith(APP_LOGOUT_CALLBACK)) {
      await this.#native.closeSystemBrowser();
      // Sesión cerrada también en el proveedor: se vuelve a empezar.
      window.location.reload();
      return;
    }
    const resolve = this.#pendingLogin;
    if (!url.startsWith(APP_LOGIN_CALLBACK) || resolve === undefined) {
      return;
    }
    await this.#native.closeSystemBrowser();
    let result;
    try {
      // Intercambia el código de la URL por los tokens, con PKCE.
      result = await firstValueFrom(this.#oidc.checkAuth(url));
    } catch {
      result = undefined;
    }
    if (!result?.isAuthenticated) {
      this.#problem.set('No se pudo completar el inicio de sesión.');
      return;
    }
    this.#problem.set(null);
    this.#acceptSession(result.userData);
    this.#pendingLogin = undefined;
    resolve(true);
  }

  #acceptSession(userData: unknown): void {
    this.#forgetLoginAttempts();
    const data = userData as { preferred_username?: unknown; name?: unknown } | null;
    const name = data?.name ?? data?.preferred_username;
    this.#userName.set(typeof name === 'string' ? name : null);
    this.#oidc.getPayloadFromAccessToken().subscribe({
      next: (payload: unknown) => {
        this.#roles.set(rolesOf(payload));
      },
      error: () => {
        this.#roles.set([]);
      },
    });
  }

  #retryWhenOnline(): void {
    window.addEventListener(
      'online',
      () => {
        window.location.reload();
      },
      { once: true },
    );
  }
}

/**
 * Las vistas del visor requieren sesión cuando hay proveedor de identidad.
 * Tras iniciarla, se vuelve a la página que se había pedido (LF-86), nunca a
 * la dirección de vuelta del proveedor, que no se puede volver a usar (LF-92).
 */
export const sessionGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(await auth.ensureSession(state.url))) {
    return false;
  }
  const path = auth.takeReturnPath() ?? withoutAuthResponse(state.url);
  return path !== state.url ? router.parseUrl(path) : true;
};
