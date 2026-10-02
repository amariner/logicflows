import { TestBed } from '@angular/core/testing';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { TEST_AUTH, testProviders } from '../../../testing/providers';
import { parseAppConfig } from '../config/app-config';
import type { NativeAuthBridge } from '../native/native-auth-bridge';
import { NATIVE_AUTH_BRIDGE } from '../native/native-auth-bridge';
import { APP_LOGIN_CALLBACK, APP_LOGOUT_CALLBACK, AuthService, openIdConfiguration } from './auth';

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

describe('sesión del visor', () => {
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

  it('si el proveedor no responde, lo indica sin entrar en un bucle de redirecciones', async () => {
    const oidc = {
      ...fakeOidc(false),
      checkAuth: vi.fn(() => throwError(() => new Error('Failed to fetch'))),
    };
    const auth = setup({ auth: true, oidc: oidc });
    expect(await auth.ensureSession()).toBe(false);
    expect(auth.problem()).toContain('No se puede contactar');
    expect(oidc.authorize).not.toHaveBeenCalled();
  });

  it('cerrar sesión la cierra también en el proveedor', () => {
    const oidc = fakeOidc(true);
    setup({ auth: true, oidc }).logout();
    expect(oidc.logoff).toHaveBeenCalled();
  });
});

/** App nativa falsa: la prueba decide cuándo vuelve el proveedor a la app. */
const fakeNative = () => {
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

  it('cierra la sesión en el proveedor también desde el navegador del sistema', () => {
    const oidc = fakeOidc(true);
    const native = fakeNative();
    setup({ auth: true, oidc, native }).logout();
    oidc.logoff.mock.calls[0]?.[1]?.urlHandler('https://idp.test/logout');
    expect(native.openInSystemBrowser).toHaveBeenCalledWith('https://idp.test/logout');
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
