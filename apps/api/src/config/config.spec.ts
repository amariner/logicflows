import { describe, expect, it } from 'vitest';

import { validateConfig } from './config.ts';

const required = {
  MQTT_API_PASSWORD: 'secreto',
  DATABASE_URL: 'postgres://logicflows:secreto@127.0.0.1:5432/logicflows',
};

describe('configuración de la API', () => {
  it('aplica los valores por defecto', () => {
    expect(validateConfig(required)).toEqual({
      API_PORT: 3000,
      LOG_LEVEL: 'info',
      MQTT_URL: 'mqtt://127.0.0.1:1883',
      MQTT_API_USERNAME: 'api',
      MQTT_API_PASSWORD: 'secreto',
      MQTT_CLIENT_ID: 'logicflows-api',
      DATABASE_URL: 'postgres://logicflows:secreto@127.0.0.1:5432/logicflows',
      CORS_ORIGINS: ['http://localhost:4200'],
    });
  });

  it('admite varios orígenes para CORS', () => {
    const config = validateConfig({
      ...required,
      CORS_ORIGINS: 'http://localhost:4200, https://visor.logicflows.example',
    });
    expect(config.CORS_ORIGINS).toEqual([
      'http://localhost:4200',
      'https://visor.logicflows.example',
    ]);
  });

  it('convierte el puerto de las variables de entorno', () => {
    expect(validateConfig({ ...required, API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  it.each([
    ['sin contraseña del broker', { DATABASE_URL: required.DATABASE_URL }],
    ['sin base de datos', { MQTT_API_PASSWORD: 'secreto' }],
    ['un origen de CORS que no es una URL', { ...required, CORS_ORIGINS: 'localhost' }],
    ['una base de datos que no es PostgreSQL', { ...required, DATABASE_URL: 'mysql://db/x' }],
    ['un puerto no numérico', { ...required, API_PORT: 'http' }],
    ['un puerto fuera de rango', { ...required, API_PORT: '70000' }],
    ['un nivel de registro desconocido', { ...required, LOG_LEVEL: 'verbose' }],
    ['un broker que no es MQTT', { ...required, MQTT_URL: 'http://broker:1883' }],
  ])('rechaza %s', (_case, env) => {
    expect(() => validateConfig(env)).toThrow('Configuración no válida');
  });
});
