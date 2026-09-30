import { describe, expect, it } from 'vitest';

import { validateConfig } from './config.ts';

describe('configuración de la API', () => {
  it('aplica los valores por defecto', () => {
    expect(validateConfig({})).toEqual({ API_PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('convierte el puerto de las variables de entorno', () => {
    expect(validateConfig({ API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  it.each([
    ['un puerto no numérico', { API_PORT: 'http' }],
    ['un puerto fuera de rango', { API_PORT: '70000' }],
    ['un nivel de registro desconocido', { LOG_LEVEL: 'verbose' }],
  ])('rechaza %s', (_case, env) => {
    expect(() => validateConfig(env)).toThrow('Configuración no válida');
  });
});
