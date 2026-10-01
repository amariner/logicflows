import { TestBed } from '@angular/core/testing';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { TEST_AUTH, testProviders } from '../../../testing/providers';
import { parseAppConfig } from '../config/app-config';
import { AuthService, openIdConfiguration } from './auth';

const fakeOidc = (isAuthenticated: boolean) => ({
  checkAuth: vi.fn(() =>
    of({
      isAuthenticated,
      userData: { name: 'Operario de pruebas' },
      accessToken: 't',
      idToken: 'i',
    }),
  ),
  authorize: vi.fn(),
  getAccessToken: vi.fn(() => of(isAuthenticated ? 'token-de-acceso' : '')),
  logoff: vi.fn(() => of(null)),
});

const setup = (options: { auth: boolean; oidc?: ReturnType<typeof fakeOidc> }) => {
  TestBed.configureTestingModule({
    providers: [
      ...testProviders({ auth: options.auth }),
      ...(options.oidc ? [{ provide: OidcSecurityService, useValue: options.oidc }] : []),
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

  it('sin proveedor no protege ninguna ruta', () => {
    const config = parseAppConfig({ apiUrl: 'https://api.example' });
    expect(openIdConfiguration(config, 'https://visor.example').secureRoutes).toEqual([]);
  });
});
