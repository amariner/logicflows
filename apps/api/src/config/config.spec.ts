import { describe, expect, it } from 'vitest';

import { validateConfig } from './config.ts';

const required = { MQTT_API_PASSWORD: 'secreto' };

describe('configuración de la API', () => {
  it('aplica los valores por defecto', () => {
    expect(validateConfig(required)).toEqual({
      API_PORT: 3000,
      LOG_LEVEL: 'info',
      MQTT_URL: 'mqtt://127.0.0.1:1883',
      MQTT_API_USERNAME: 'api',
      MQTT_API_PASSWORD: 'secreto',
      MQTT_CLIENT_ID: 'logicflows-api',
    });
  });

  it('convierte el puerto de las variables de entorno', () => {
    expect(validateConfig({ ...required, API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  it.each([
    ['sin contraseña del broker', {}],
    ['un puerto no numérico', { ...required, API_PORT: 'http' }],
    ['un puerto fuera de rango', { ...required, API_PORT: '70000' }],
    ['un nivel de registro desconocido', { ...required, LOG_LEVEL: 'verbose' }],
    ['un broker que no es MQTT', { ...required, MQTT_URL: 'http://broker:1883' }],
  ])('rechaza %s', (_case, env) => {
    expect(() => validateConfig(env)).toThrow('Configuración no válida');
  });
});
