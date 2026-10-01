import { describe, expect, it } from 'vitest';

import { parseAppConfig } from './app-config';

describe('configuración del visor', () => {
  it('deriva la URL del canal de tiempo real de la URL de la API', () => {
    expect(parseAppConfig({ apiUrl: 'http://localhost:3000' })).toEqual({
      apiUrl: 'http://localhost:3000',
      realtimeUrl: 'ws://localhost:3000/realtime',
      auth: null,
    });
  });

  it('lee el proveedor de identidad', () => {
    expect(
      parseAppConfig({
        apiUrl: 'http://localhost:3000',
        auth: { issuer: 'http://localhost:8180/realms/logicflows/', clientId: 'logicflows-visor' },
      }).auth,
    ).toEqual({ issuer: 'http://localhost:8180/realms/logicflows', clientId: 'logicflows-visor' });
  });

  it('usa un canal cifrado cuando la API usa https', () => {
    expect(parseAppConfig({ apiUrl: 'https://api.logicflows.example' }).realtimeUrl).toBe(
      'wss://api.logicflows.example/realtime',
    );
  });

  it.each([
    ['un valor que no es un objeto', 'http://localhost:3000'],
    ['un objeto sin apiUrl', {}],
    ['una apiUrl que no es texto', { apiUrl: 3000 }],
    ['una apiUrl que no es una URL', { apiUrl: 'localhost' }],
    ['una apiUrl con otro protocolo', { apiUrl: 'ftp://localhost' }],
    ['auth sin clientId', { apiUrl: 'http://a', auth: { issuer: 'http://idp' } }],
    [
      'auth con un emisor que no es URL',
      { apiUrl: 'http://a', auth: { issuer: 'idp', clientId: 'v' } },
    ],
    [
      'auth con clientId vacío',
      { apiUrl: 'http://a', auth: { issuer: 'http://idp', clientId: '' } },
    ],
  ])('rechaza %s', (_case, value) => {
    expect(() => parseAppConfig(value)).toThrow('config.json no válido');
  });
});
