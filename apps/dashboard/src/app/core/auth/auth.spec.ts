import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import {
  AbstractSecurityStorage,
  DefaultLocalStorageService,
  DefaultSessionStorageService,
  OidcSecurityService,
} from 'angular-auth-oidc-client';
import { firstValueFrom, of, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_AUTH, testProviders } from '../../../testing/providers';
import { parseAppConfig } from '../config/app-config';
import type { NativeAuthBridge } from '../native/native-auth-bridge';
import { NATIVE_AUTH_BRIDGE } from '../native/native-auth-bridge';
import {
  APP_LOGIN_CALLBACK,
  APP_LOGOUT_CALLBACK,
  AuthService,
  openIdConfiguration,
  safeReturnPath,
  sessionGuard,
  withoutAuthResponse,
} from './auth';

interface FakeAuthResult {
  isAuthenticated: boolean;
  userData: unknown;
  accessToken: string;
  idToken: string;
}
type UrlHandlerOptions = { urlHandler: (url: string) => void } | undefined;

const fakeOidc = (isAuthenticated: boolean) => ({
  checkAuth: vi.fn<(url?: string) => Observable<FakeAuthResult>>(() =>
    of({
      isAuthenticated,
      userData: { name: 'Operario de pruebas' },
      accessToken: 't',
      idToken: 'i',
    }),
  ),
  authorize: vi.fn<(configId?: string, options?: UrlHandlerOptions) => void>(),
  preloadAuthWellKnownDocument: vi.fn<() => Observable<unknown>>(() => of({})),
  getAccessToken: vi.fn(() => of(isAuthenticated ? 'token-de-acceso' : '')),
  logoff: vi.fn<(configId?: string, options?: UrlHandlerOptions) => Observable<null>>(() =>
    of(null),
  ),
});

const setup = (options: {
  auth: boolean;
  oidc?: ReturnType<typeof fakeOidc>;
  native?: NativeAuthBridge;
}) => {
  TestBed.configureTestingModule({
    providers: [
      ...testProviders({ auth: options.auth }),
      ...(options.oidc ? [{ provide: OidcSecurityService, useValue: options.oidc }] : []),
      ...(options.native ? [{ provide: NATIVE_AUTH_BRIDGE, useValue: options.native }] : []),
    ],
  });
  return TestBed.inject(AuthService);
};

// Cada prueba empieza sin intentos de inicio de sesión anteriores (LF-118).
beforeEach(() => {
  sessionStorage.removeItem('logicflows.intentos-de-inicio-de-sesion');
});

describe('sesión del visor', () => {
  it('en el navegador, el estado del inicio de sesión vive en sessionStorage', () => {
    setup({ auth: true, oidc: fakeOidc(true) });
    expect(TestBed.inject(AbstractSecurityStorage)).toBeInstanceOf(DefaultSessionStorageService);
  });

  it('sin proveedor de identidad no pide sesión ni token', async () => {
    const auth = setup({ auth: false });
    expect(auth.enabled).toBe(false);
    expect(await auth.ensureSession()).toBe(true);
    expect(await auth.accessToken()).toBeNull();
  });

  it('con sesión, la acepta y guarda el nombre del usuario', async () => {
    const oidc = fakeOidc(true);
    const auth = setup({ auth: true, oidc });
    expect(await auth.ensureSession()).toBe(true);
    expect(auth.userName()).toBe('Operario de pruebas');
    expect(await auth.accessToken()).toBe('token-de-acceso');
    expect(oidc.authorize).not.toHaveBeenCalled();
  });

  it('sin sesión, redirige al inicio de sesión una sola vez', async () => {
    const oidc = fakeOidc(false);
    const auth = setup({ auth: true, oidc });
    expect(await auth.ensureSession()).toBe(false);
    expect(await auth.ensureSession()).toBe(false);
    expect(oidc.checkAuth).toHaveBeenCalledTimes(1);
    expect(oidc.authorize).toHaveBeenCalledTimes(1);
  });

  describe('intentos seguidos sin conseguir sesión (LF-118)', () => {
    /** Cada intento es una carga nueva de la página. */
    const attempt = async (authenticated = false) => {
      TestBed.resetTestingModule();
      const oidc = fakeOidc(authenticated);
      const auth = setup({ auth: true, oidc });
      const result = await auth.ensureSession();
      return { auth, oidc, result };
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it('tras dos intentos deja de redirigir y lo indica, en lugar de entrar en un bucle', async () => {
      expect((await attempt()).oidc.authorize).toHaveBeenCalledTimes(1);
      expect((await attempt()).oidc.authorize).toHaveBeenCalledTimes(1);
      const third = await attempt();
      expect(third.result).toBe(false);
      expect(third.oidc.authorize).not.toHaveBeenCalled();
      expect(third.auth.problem()).toBe('No se pudo completar el inicio de sesión.');
    });

    it('una sesión conseguida vuelve a permitir los dos intentos', async () => {
      await attempt();
      await attempt();
      expect((await attempt(true)).result).toBe(true);
      expect((await attempt()).oidc.authorize).toHaveBeenCalledTimes(1);
    });

    it('los intentos de hace más de dos minutos no cuentan', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-08T08:00:00Z'));
      await attempt();
      await attempt();
      vi.setSystemTime(new Date('2026-10-08T08:03:00Z'));
      expect((await attempt()).oidc.authorize).toHaveBeenCalledTimes(1);
    });
  });

  it('sin sesión, recuerda la página pedida y la devuelve una sola vez (LF-86)', async () => {
    sessionStorage.clear();
    const auth = setup({ auth: true, oidc: fakeOidc(false) });
    expect(await auth.ensureSession('/cells/demo/cell-01/history')).toBe(false);
    expect(auth.takeReturnPath()).toBe('/cells/demo/cell-01/history');
    expect(auth.takeReturnPath()).toBeNull();
  });

  it('sin ruta, recuerda la dirección actual del navegador', async () => {
    sessionStorage.clear();
    history.replaceState(null, '', '/cells/demo/cell-02/history');
    const auth = setup({ auth: true, oidc: fakeOidc(false) });
    expect(await auth.ensureSession()).toBe(false);
    expect(auth.takeReturnPath()).toBe('/cells/demo/cell-02/history');
    history.replaceState(null, '', '/');
  });

  it.each([
    ['https://otro.example/cells', null],
    ['//otro.example/cells', null],
    ['/\\otro.example', null],
    ['/javascript:alert(1)', null],
    ['cells', null],
    ['/cells/demo/cell-01/history?x=1', '/cells/demo/cell-01/history?x=1'],
  ])('solo vuelve a rutas del propio visor: %s', (value, expected) => {
    expect(safeReturnPath(value)).toBe(expected);
  });

  it('sin conexión no redirige al proveedor e indica el motivo', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const oidc = fakeOidc(false);
    const auth = setup({ auth: true, oidc });
    expect(await auth.ensureSession()).toBe(false);
    expect(auth.problem()).toContain('Sin conexión');
    expect(oidc.checkAuth).not.toHaveBeenCalled();
    expect(oidc.authorize).not.toHaveBeenCalled();
    online.mockRestore();
  });

  it('si el proveedor no responde, lo indica y ofrece reintentar sin redirigir (LF-92)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const oidc = fakeOidc(false);
    oidc.preloadAuthWellKnownDocument.mockReturnValue(
      throwError(() => new Error('Http failure response: 0 Unknown Error')),
    );
    const auth = setup({ auth: true, oidc });
    expect(await auth.ensureSession()).toBe(false);
    expect(auth.problem()).toBe('No se puede contactar con el servicio de inicio de sesión.');
    expect(oidc.authorize).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('configuración del proveedor'),
      expect.any(Error),
    );
    error.mockRestore();
  });

  it('si la comprobación falla por otra causa, no la presenta como un fallo de red ni entra en un bucle', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const oidc = fakeOidc(false);
    oidc.checkAuth.mockReturnValue(throwError(() => new Error('inesperado')));
    const auth = setup({ auth: true, oidc });
    expect(await auth.ensureSession()).toBe(false);
    expect(auth.problem()).toBe('No se pudo comprobar la sesión.');
    expect(oidc.authorize).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('comprobar la sesión'),
      expect.any(Error),
    );
    error.mockRestore();
  });

  describe('al volver a una dirección de vuelta del proveedor ya usada (LF-92)', () => {
    beforeEach(() => {
      sessionStorage.clear();
      history.replaceState(null, '', '/cells?code=usado&state=viejo&session_state=s');
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      history.replaceState(null, '', '/');
      vi.restoreAllMocks();
    });

    const staleThenSession = (isAuthenticated: boolean) => {
      const oidc = fakeOidc(isAuthenticated);
      oidc.checkAuth.mockReturnValueOnce(
        throwError(() => new Error('could not find matching config for state viejo')),
      );
      return oidc;
    };

    it('la descarta y conserva la sesión que había, sin avisos', async () => {
      const oidc = staleThenSession(true);
      const auth = setup({ auth: true, oidc });
      expect(await auth.ensureSession()).toBe(true);
      expect(oidc.checkAuth).toHaveBeenCalledTimes(2);
      expect(`${location.pathname}${location.search}`).toBe('/cells');
      expect(auth.problem()).toBeNull();
      expect(oidc.authorize).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('se descarta una vuelta del proveedor'),
        expect.any(Error),
      );
    });

    it('sin sesión, vuelve a iniciarla y recuerda la página sin la vuelta', async () => {
      const oidc = staleThenSession(false);
      const auth = setup({ auth: true, oidc });
      expect(await auth.ensureSession('/cells?code=usado&state=viejo&session_state=s')).toBe(false);
      expect(oidc.authorize).toHaveBeenCalledTimes(1);
      expect(auth.problem()).toBeNull();
      expect(auth.takeReturnPath()).toBe('/cells');
    });
  });

  it('cerrar sesión la cierra también en el proveedor', () => {
    const oidc = fakeOidc(true);
    setup({ auth: true, oidc }).logout();
    expect(oidc.logoff).toHaveBeenCalled();
  });
});

/** App nativa falsa: la prueba decide cuándo vuelve el proveedor a la app. */
const fakeNative = (launch?: string) => {
  let urlHandler: (url: string) => void = () => undefined;
  let closedHandler: () => void = () => undefined;
  return {
    native: true,
    openInSystemBrowser: vi.fn(() => Promise.resolve()),
    closeSystemBrowser: vi.fn(() => Promise.resolve()),
    onAppUrlOpen: (handler: (url: string) => void) => {
      urlHandler = handler;
    },
    onSystemBrowserClosed: (handler: () => void) => {
      closedHandler = handler;
    },
    launchUrl: vi.fn(() => Promise.resolve(launch)),
    openApp: (url: string) => {
      urlHandler(url);
    },
    closeBrowser: () => {
      closedHandler();
    },
  };
};

/** Espera a que terminen las promesas pendientes. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('sesión en la app Android (LF-68)', () => {
  const nativeOidc = () => {
    const oidc = fakeOidc(false);
    // Sin sesión al arrancar; con sesión al volver del proveedor con el código.
    oidc.checkAuth.mockImplementation((url?: string) =>
      of({
        isAuthenticated: url !== undefined,
        userData: { name: 'Operario de pruebas' },
        accessToken: 't',
        idToken: 'i',
      }),
    );
    return oidc;
  };

  it('abre el inicio de sesión en el navegador del sistema, no en la vista web', async () => {
    const oidc = nativeOidc();
    const native = fakeNative();
    const auth = setup({ auth: true, oidc, native });
    void auth.ensureSession();
    await settle();
    expect(oidc.authorize).toHaveBeenCalledTimes(1);
    oidc.authorize.mock.calls[0]?.[1]?.urlHandler('https://idp.test/auth?code_challenge=x');
    expect(native.openInSystemBrowser).toHaveBeenCalledWith(
      'https://idp.test/auth?code_challenge=x',
    );
  });

  it('la sesión empieza cuando el proveedor vuelve a la app con el código', async () => {
    const oidc = nativeOidc();
    const native = fakeNative();
    const auth = setup({ auth: true, oidc, native });
    let authenticated: boolean | undefined;
    void auth.ensureSession().then((value) => {
      authenticated = value;
    });
    await settle();
    expect(authenticated).toBeUndefined();

    native.openApp(`${APP_LOGIN_CALLBACK}?code=abc&state=xyz`);
    await settle();

    expect(oidc.checkAuth).toHaveBeenLastCalledWith(`${APP_LOGIN_CALLBACK}?code=abc&state=xyz`);
    expect(native.closeSystemBrowser).toHaveBeenCalled();
    expect(authenticated).toBe(true);
    expect(auth.userName()).toBe('Operario de pruebas');
    expect(auth.problem()).toBeNull();
  });

  it('ignora URL que no son la vuelta del inicio de sesión', async () => {
    const oidc = nativeOidc();
    const native = fakeNative();
    void setup({ auth: true, oidc, native }).ensureSession();
    await settle();
    native.openApp('io.github.amariner.logicflows:/otra-cosa?code=abc');
    await settle();
    expect(oidc.checkAuth).toHaveBeenCalledTimes(1);
  });

  it('si se cierra el navegador sin volver con sesión, ofrece reintentar', async () => {
    const native = fakeNative();
    const auth = setup({ auth: true, oidc: nativeOidc(), native });
    void auth.ensureSession();
    await settle();
    native.closeBrowser();
    expect(auth.problem()).toBe('No se completó el inicio de sesión.');
  });

  it('si el proveedor rechaza el código, lo indica', async () => {
    const oidc = nativeOidc();
    oidc.checkAuth.mockImplementation(() =>
      of({ isAuthenticated: false, userData: null, accessToken: '', idToken: '' }),
    );
    const native = fakeNative();
    const auth = setup({ auth: true, oidc, native });
    void auth.ensureSession();
    await settle();
    native.openApp(`${APP_LOGIN_CALLBACK}?code=caducado`);
    await settle();
    expect(auth.problem()).toBe('No se pudo completar el inicio de sesión.');
  });

  describe('si Android cerró la app mientras estaba en el navegador (LF-75)', () => {
    const CALLBACK = `${APP_LOGIN_CALLBACK}?code=abc&state=xyz`;

    beforeEach(() => {
      localStorage.clear();
    });

    it('completa la sesión con la URL de arranque, sin abrir otra vez el inicio de sesión', async () => {
      const oidc = nativeOidc();
      const auth = setup({ auth: true, oidc, native: fakeNative(CALLBACK) });
      expect(await auth.ensureSession()).toBe(true);
      expect(oidc.checkAuth).toHaveBeenCalledWith(CALLBACK);
      expect(oidc.authorize).not.toHaveBeenCalled();
    });

    it('no reutiliza la misma URL de arranque al recargar', async () => {
      localStorage.setItem('logicflows.inicio-de-sesion', CALLBACK);
      const oidc = nativeOidc();
      const auth = setup({ auth: true, oidc, native: fakeNative(CALLBACK) });
      void auth.ensureSession();
      await settle();
      expect(oidc.checkAuth).toHaveBeenCalledWith();
      expect(oidc.authorize).toHaveBeenCalledTimes(1);
    });

    it('guarda el estado del inicio de sesión en el almacenamiento local de la app', () => {
      setup({ auth: true, oidc: nativeOidc(), native: fakeNative() });
      expect(TestBed.inject(AbstractSecurityStorage)).toBeInstanceOf(DefaultLocalStorageService);
    });
  });

  it('cierra la sesión en el proveedor también desde el navegador del sistema', () => {
    const oidc = fakeOidc(true);
    const native = fakeNative();
    setup({ auth: true, oidc, native }).logout();
    oidc.logoff.mock.calls[0]?.[1]?.urlHandler('https://idp.test/logout');
    expect(native.openInSystemBrowser).toHaveBeenCalledWith('https://idp.test/logout');
  });
});

describe('con la librería de OpenID Connect (LF-92)', () => {
  const WELL_KNOWN = `${TEST_AUTH.issuer}/.well-known/openid-configuration`;

  beforeEach(() => {
    sessionStorage.clear();
    history.replaceState(null, '', '/cells?code=usado&state=viejo');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  const setupReal = () => {
    TestBed.configureTestingModule({ providers: testProviders({ auth: true }) });
    const oidc = TestBed.inject(OidcSecurityService);
    // La redirección real sacaría a la prueba de la página.
    const authorize = vi.spyOn(oidc, 'authorize').mockImplementation(() => undefined);
    return {
      oidc,
      authorize,
      http: TestBed.inject(HttpTestingController),
      auth: TestBed.inject(AuthService),
    };
  };

  it('causa: una vuelta ya usada hace fallar checkAuth sin consultar la red', async () => {
    const { oidc, http } = setupReal();
    await expect(firstValueFrom(oidc.checkAuth())).rejects.toThrow(
      'could not find matching config for state viejo',
    );
    http.verify();
  });

  it('el visor la descarta y vuelve a iniciar sesión sin presentarlo como un fallo de red', async () => {
    const { auth, authorize, http } = setupReal();
    const session = auth.ensureSession('/cells?code=usado&state=viejo');
    await vi.waitFor(() => {
      http.expectOne(WELL_KNOWN).flush({
        issuer: TEST_AUTH.issuer,
        authorization_endpoint: `${TEST_AUTH.issuer}/protocol/openid-connect/auth`,
      });
    });
    expect(await session).toBe(false);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(auth.problem()).toBeNull();
    expect(`${location.pathname}${location.search}`).toBe('/cells');
    expect(auth.takeReturnPath()).toBe('/cells');
  });

  it('si el proveedor no responde, lo indica en lugar de quedarse en blanco', async () => {
    history.replaceState(null, '', '/cells');
    const { auth, authorize, http } = setupReal();
    const session = auth.ensureSession();
    // La librería reintenta dos veces la descarga de la configuración.
    for (let attempt = 0; attempt < 3; attempt++) {
      await vi.waitFor(() => {
        http.expectOne(WELL_KNOWN).error(new ProgressEvent('error'));
      });
    }
    expect(await session).toBe(false);
    expect(auth.problem()).toBe('No se puede contactar con el servicio de inicio de sesión.');
    expect(authorize).not.toHaveBeenCalled();
  });
});

describe('guarda de las vistas', () => {
  const guard = (url: string) =>
    TestBed.runInInjectionContext(() =>
      sessionGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('tras iniciar sesión no deja en la barra la dirección de vuelta del proveedor (LF-92)', async () => {
    setup({ auth: true, oidc: fakeOidc(true) });
    const result = (await guard('/cells?code=abc&state=xyz')) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/cells');
  });

  it('deja pasar las demás direcciones tal cual', async () => {
    setup({ auth: true, oidc: fakeOidc(true) });
    expect(await guard('/cells/demo/cell-01/history?from=2026-10-01T00:00:00.000Z')).toBe(true);
  });

  it.each([
    ['/cells?code=a&state=b', '/cells'],
    ['/cells?state=b&session_state=s&iss=x&code=a', '/cells'],
    ['/cells?error=access_denied&error_description=x&state=b', '/cells'],
    ['/cells/demo/cell-01/history?x=1&code=a&state=b', '/cells/demo/cell-01/history?x=1'],
    ['/cells?code=a', '/cells?code=a'],
    ['/cells?from=2026-10-01T00:00:00.000Z', '/cells?from=2026-10-01T00:00:00.000Z'],
  ])('quita la vuelta del proveedor de %s', (path, expected) => {
    expect(withoutAuthResponse(path)).toBe(expected);
  });
});

describe('configuración OpenID Connect', () => {
  it('usa Authorization Code con PKCE, tokens de refresco y el token solo hacia la API', () => {
    const config = parseAppConfig({ apiUrl: 'https://api.example', auth: TEST_AUTH });
    expect(openIdConfiguration(config, 'https://visor.example')).toMatchObject({
      authority: TEST_AUTH.issuer,
      clientId: TEST_AUTH.clientId,
      responseType: 'code',
      redirectUrl: 'https://visor.example/cells',
      postLogoutRedirectUri: 'https://visor.example',
      useRefreshToken: true,
      silentRenew: true,
      secureRoutes: ['https://api.example'],
    });
  });

  it('en la app, el proveedor vuelve por el esquema propio de la app', () => {
    const config = parseAppConfig({ apiUrl: 'https://api.example', auth: TEST_AUTH });
    expect(openIdConfiguration(config, 'https://localhost', true)).toMatchObject({
      redirectUrl: APP_LOGIN_CALLBACK,
      postLogoutRedirectUri: APP_LOGOUT_CALLBACK,
      responseType: 'code',
      secureRoutes: ['https://api.example'],
    });
    expect(APP_LOGIN_CALLBACK).toBe('io.github.amariner.logicflows:/callback');
  });

  it('sin proveedor no protege ninguna ruta', () => {
    const config = parseAppConfig({ apiUrl: 'https://api.example' });
    expect(openIdConfiguration(config, 'https://visor.example').secureRoutes).toEqual([]);
  });
});
