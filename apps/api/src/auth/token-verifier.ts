import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';

import type { AppConfig } from '../config/config.ts';
import { rolesFromClaims } from './roles.ts';
import type { Principal } from './roles.ts';

/** El token está mal formado, caducado, sin la audiencia o de otro emisor. */
export class InvalidTokenError extends Error {}

/** No se pueden obtener las claves públicas del emisor: no es culpa del cliente. */
export class IssuerUnavailableError extends Error {}

/**
 * Valida tokens de acceso JWT con las claves públicas del emisor OpenID
 * Connect configurado (ADR-0009). No depende de qué proveedor los emite.
 */
@Injectable()
export class TokenVerifier {
  readonly #issuer: string;
  readonly #audience: string;
  readonly #rolesClaim: string;
  readonly #jwksUrl: string | undefined;
  #keys: Promise<JWTVerifyGetKey> | undefined;

  constructor(config: ConfigService<AppConfig, true>) {
    this.#issuer = config.get('AUTH_ISSUER', { infer: true });
    this.#audience = config.get('AUTH_AUDIENCE', { infer: true });
    this.#rolesClaim = config.get('AUTH_ROLES_CLAIM', { infer: true });
    this.#jwksUrl = config.get('AUTH_JWKS_URL', { infer: true });
  }

  async verify(token: string): Promise<Principal> {
    const keys = await this.#getKeys();
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, keys, {
        issuer: this.#issuer,
        audience: this.#audience,
      }));
    } catch (error) {
      if (error instanceof TypeError || (error as { code?: string }).code === 'ERR_JWKS_TIMEOUT') {
        throw new IssuerUnavailableError(error instanceof Error ? error.message : String(error));
      }
      throw new InvalidTokenError(error instanceof Error ? error.message : String(error));
    }
    if (typeof payload.sub !== 'string' || payload.exp === undefined) {
      throw new InvalidTokenError('El token no identifica al usuario o no caduca');
    }
    return {
      subject: payload.sub,
      roles: rolesFromClaims(payload, this.#rolesClaim),
      expiresAt: payload.exp * 1000,
    };
  }

  /** Las claves se descubren en la primera petición; un fallo se reintenta en la siguiente. */
  #getKeys(): Promise<JWTVerifyGetKey> {
    this.#keys ??= this.#keysUrl().then((url) => createRemoteJWKSet(new URL(url)));
    return this.#keys.catch((error: unknown) => {
      this.#keys = undefined;
      throw new IssuerUnavailableError(error instanceof Error ? error.message : String(error));
    });
  }

  async #keysUrl(): Promise<string> {
    if (this.#jwksUrl !== undefined) {
      return this.#jwksUrl;
    }
    const response = await fetch(`${this.#issuer}/.well-known/openid-configuration`);
    if (!response.ok) {
      throw new Error(`Descubrimiento OpenID Connect fallido (${String(response.status)})`);
    }
    const { jwks_uri: jwksUri } = (await response.json()) as { jwks_uri?: unknown };
    if (typeof jwksUri !== 'string') {
      throw new Error('El emisor no publica sus claves (jwks_uri)');
    }
    return jwksUri;
  }
}
