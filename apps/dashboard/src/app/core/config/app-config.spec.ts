import { describe, expect, it } from 'vitest';

import { parseAppConfig } from './app-config';

describe('configuración del visor', () => {
  it('deriva la URL del canal de tiempo real de la URL de la API', () => {
    expect(parseAppConfig({ apiUrl: 'http://localhost:3000' })).toEqual({
      apiUrl: 'http://localhost:3000',
      realtimeUrl: 'ws://localhost:3000/realtime',
    });
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
  ])('rechaza %s', (_case, value) => {
    expect(() => parseAppConfig(value)).toThrow('config.json no válido');
  });
});
