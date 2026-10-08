import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { CryptoKey } from 'jose';

import type { Role } from '../auth/roles.ts';

export const TEST_AUDIENCE = 'logicflows-api';
export const TEST_TICKET_SECRET = 'secreto-de-tiques-solo-para-pruebas-0123456789';

export interface TokenOptions {
  readonly subject?: string;
  /** `preferred_username`; sin él, el token no lo trae. */
  readonly name?: string;
  readonly roles?: readonly Role[];
  readonly audience?: string;
  /** Segundos hasta la caducidad; negativo para un token ya caducado. */
  readonly expiresInSeconds?: number;
}

export interface TestIssuer {
  readonly url: string;
  /** Firma un token de acceso como lo haría Keycloak. */
  token(options?: TokenOptions): Promise<string>;
  /** Firma un token con otra clave: el emisor no lo reconocería. */
  forgedToken(options?: TokenOptions): Promise<string>;
}

let issuer: Promise<TestIssuer> | undefined;

/**
 * Emisor OpenID Connect mínimo para las pruebas: publica el descubrimiento y
 * sus claves públicas y firma tokens con los roles en `realm_access.roles`,
 * como Keycloak. Se comparte entre las pruebas de un mismo fichero.
 */
export function testIssuer(): Promise<TestIssuer> {
  issuer ??= startIssuer();
  return issuer;
}

async function startIssuer(): Promise<TestIssuer> {
  const keys = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'clave-de-prueba',
    alg: 'RS256',
    use: 'sig',
  };

  const server = createServer((request, response) => {
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    if (request.url === '/.well-known/openid-configuration') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ issuer: base, jwks_uri: `${base}/jwks` }));
      return;
    }
    if (request.url === '/jwks') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const sign = (key: CryptoKey, options: TokenOptions) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      realm_access: { roles: options.roles ?? ['viewer'] },
      ...(options.name === undefined ? {} : { preferred_username: options.name }),
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'clave-de-prueba' })
      .setIssuer(url)
      .setAudience(options.audience ?? TEST_AUDIENCE)
      .setSubject(options.subject ?? 'operario')
      .setIssuedAt(now)
      .setExpirationTime(now + (options.expiresInSeconds ?? 300))
      .sign(key);
  };
  return {
    url,
    token: (options = {}) => sign(keys.privateKey, options),
    forgedToken: (options = {}) => sign(other.privateKey, options),
  };
}
