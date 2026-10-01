import { Injectable, inject, signal } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import {
  LogLevel,
  OidcSecurityService,
  StsConfigLoader,
  StsConfigStaticLoader,
  provideAuth,
} from 'angular-auth-oidc-client';
import type { OpenIdConfiguration } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../config/app-config';
import type { AppConfig } from '../config/app-config';

/**
 * Configuración OpenID Connect del visor (ADR-0009): Authorization Code con
 * PKCE como cliente público, token de acceso de vida corta renovado con un
 * token de refresco, y el token solo en las peticiones a la API.
 */
export function openIdConfiguration(config: AppConfig, origin: string): OpenIdConfiguration {
  if (config.auth === null) {
    // Sin inicio de sesión: la librería necesita una configuración, pero no se usa.
    return { authority: origin, clientId: 'sin-autenticacion', secureRoutes: [] };
  }
  return {
    authority: config.auth.issuer,
    clientId: config.auth.clientId,
    redirectUrl: `${origin}/cells`,
    postLogoutRedirectUri: origin,
    scope: 'openid profile',
    responseType: 'code',
    useRefreshToken: true,
    silentRenew: true,
    renewTimeBeforeTokenExpiresInSeconds: 30,
    ignoreNonceAfterRefresh: true,
    secureRoutes: [config.apiUrl],
    logLevel: LogLevel.Warn,
  };
}

/** Proveedores del inicio de sesión. La configuración se lee de `config.json`. */
export function provideVisorAuth(): EnvironmentProviders {
  return provideAuth({
    loader: {
      provide: StsConfigLoader,
      useFactory: () =>
        new StsConfigStaticLoader(
          openIdConfiguration(inject(AppConfigService).config, window.location.origin),
        ),
    },
  });
}

/** Sesión del usuario del visor. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly #config = inject(AppConfigService);
  readonly #oidc = inject(OidcSecurityService);
  readonly #userName = signal<string | null>(null);
  readonly #problem = signal<string | null>(null);
  #session: Promise<boolean> | undefined;

  /** Nombre del usuario con sesión, para mostrarlo en el menú. */
  readonly userName = this.#userName.asReadonly();

  /**
   * Por qué no se puede comprobar la sesión: sin conexión o sin respuesta del
   * proveedor. Mientras tanto no se redirige a ninguna parte.
   */
  readonly problem = this.#problem.asReadonly();

  get enabled(): boolean {
    return this.#config.config.auth !== null;
  }

  /**
   * Comprueba la sesión, también al volver del proveedor tras iniciarla. Sin
   * sesión redirige al inicio de sesión y devuelve `false`. Se evalúa una vez.
   */
  ensureSession(): Promise<boolean> {
    this.#session ??= this.#checkSession();
    return this.#session;
  }

  async accessToken(): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }
    const token = await firstValueFrom(this.#oidc.getAccessToken());
    return token === '' ? null : token;
  }

  logout(): void {
    this.#oidc.logoff().subscribe();
  }

  async #checkSession(): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }
    // Sin conexión, redirigir al proveedor mostraría una página de error del navegador.
    if (!navigator.onLine) {
      this.#problem.set('Sin conexión: el visor necesita conexión para mostrar datos en directo.');
      this.#retryWhenOnline();
      return false;
    }
    let result;
    try {
      result = await firstValueFrom(this.#oidc.checkAuth());
    } catch {
      this.#problem.set('No se puede contactar con el servicio de inicio de sesión.');
      this.#retryWhenOnline();
      return false;
    }
    if (result.isAuthenticated) {
      const data = result.userData as { preferred_username?: unknown; name?: unknown } | null;
      const name = data?.name ?? data?.preferred_username;
      this.#userName.set(typeof name === 'string' ? name : null);
      return true;
    }
    this.#oidc.authorize();
    return false;
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

/** Las vistas del visor requieren sesión cuando hay proveedor de identidad. */
export const sessionGuard: CanActivateFn = () => inject(AuthService).ensureSession();
