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
          openIdConfiguration(
            inject(AppConfigService).config,
            typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
          ),
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
  #session: Promise<boolean> | undefined;

  /** Nombre del usuario con sesión, para mostrarlo en el menú. */
  readonly userName = this.#userName.asReadonly();

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
    // Spike LF-56: el servidor no tiene la sesión del usuario; renderiza el esqueleto.
    if (!this.enabled || typeof window === 'undefined') {
      return true;
    }
    const result = await firstValueFrom(this.#oidc.checkAuth());
    if (result.isAuthenticated) {
      const data = result.userData as { preferred_username?: unknown; name?: unknown } | null;
      const name = data?.name ?? data?.preferred_username;
      this.#userName.set(typeof name === 'string' ? name : null);
      return true;
    }
    this.#oidc.authorize();
    return false;
  }
}

/** Las vistas del visor requieren sesión cuando hay proveedor de identidad. */
export const sessionGuard: CanActivateFn = () => inject(AuthService).ensureSession();
