import { describe, expect, it } from 'vitest';

import { defaultClientId, validateConfig } from './config.ts';

const required = {
  MQTT_API_PASSWORD: 'secreto',
  DATABASE_URL: 'postgres://logicflows:secreto@127.0.0.1:5432/logicflows',
  AUTH_ISSUER: 'http://localhost:8180/realms/logicflows',
  REALTIME_TICKET_SECRET: 'secreto-de-tiques-de-al-menos-32-caracteres',
};

describe('configuración de la API', () => {
  it('aplica los valores por defecto', () => {
    expect(validateConfig(required, 'api-7f9c')).toEqual({
      API_PORT: 3000,
      LOG_LEVEL: 'info',
      MQTT_URL: 'mqtt://127.0.0.1:1883',
      MQTT_API_USERNAME: 'api',
      MQTT_API_PASSWORD: 'secreto',
      MQTT_CLIENT_ID: 'logicflows-api-api-7f9c',
      DATABASE_URL: 'postgres://logicflows:secreto@127.0.0.1:5432/logicflows',
      AUTH_ISSUER: 'http://localhost:8180/realms/logicflows',
      AUTH_AUDIENCE: 'logicflows-api',
      AUTH_ROLES_CLAIM: 'realm_access.roles',
      REALTIME_TICKET_SECRET: 'secreto-de-tiques-de-al-menos-32-caracteres',
      RATE_LIMIT_PER_MINUTE: 300,
      TRUST_PROXY_HOPS: 0,
      CORS_ORIGINS: ['http://localhost:4200'],
    });
  });

  it('lee la cuenta de servicio de Firebase para los avisos (ADR-0015)', () => {
    const account = {
      type: 'service_account',
      project_id: 'logicflows-avisos',
      client_email: 'avisos@logicflows-avisos.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n',
    };
    const config = validateConfig({ ...required, FCM_SERVICE_ACCOUNT: JSON.stringify(account) });
    expect(config.FCM_SERVICE_ACCOUNT).toEqual({
      project_id: account.project_id,
      client_email: account.client_email,
      private_key: account.private_key,
    });
    expect(
      validateConfig({ ...required, FCM_SERVICE_ACCOUNT: '' }).FCM_SERVICE_ACCOUNT,
    ).toBeUndefined();
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

  it('cada instancia obtiene un identificador MQTT propio derivado de su equipo', () => {
    const first = validateConfig(required, 'a1b2c3d4e5f6').MQTT_CLIENT_ID;
    const second = validateConfig(required, '0f9e8d7c6b5a').MQTT_CLIENT_ID;
    expect(first).toBe('logicflows-api-a1b2c3d4e5f6');
    expect(second).not.toBe(first);
  });

  it('respeta el identificador MQTT indicado', () => {
    expect(validateConfig({ ...required, MQTT_CLIENT_ID: 'api-planta-1' }).MQTT_CLIENT_ID).toBe(
      'api-planta-1',
    );
  });

  it.each([
    ['MacBook-Pro.local', 'logicflows-api-macbook-pro-local'],
    ['', 'logicflows-api-local'],
    ['x'.repeat(100), `logicflows-api-${'x'.repeat(49)}`],
  ])('normaliza el nombre del equipo «%s»', (host, expected) => {
    expect(defaultClientId(host)).toBe(expected);
  });

  it.each([
    ['mqtts://broker:8883'],
    ['wss://mqtt.logicflows.example/mqtt'],
    ['ws://mosquitto:9001'],
  ])('admite el broker %s', (url) => {
    expect(validateConfig({ ...required, MQTT_URL: url }).MQTT_URL).toBe(url);
  });

  it('convierte el puerto de las variables de entorno', () => {
    expect(validateConfig({ ...required, API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  it.each([
    ['sin contraseña del broker', { DATABASE_URL: required.DATABASE_URL }],
    ['sin base de datos', { ...required, DATABASE_URL: undefined }],
    ['sin emisor de tokens', { ...required, AUTH_ISSUER: undefined }],
    ['un emisor que no es una URL HTTP', { ...required, AUTH_ISSUER: 'ftp://idp' }],
    ['un secreto de tiques demasiado corto', { ...required, REALTIME_TICKET_SECRET: 'corto' }],
    ['un origen de CORS que no es una URL', { ...required, CORS_ORIGINS: 'localhost' }],
    ['un comodín en los orígenes de CORS', { ...required, CORS_ORIGINS: '*' }],
    ['un límite de peticiones nulo', { ...required, RATE_LIMIT_PER_MINUTE: '0' }],
    ['una base de datos que no es PostgreSQL', { ...required, DATABASE_URL: 'mysql://db/x' }],
    ['un puerto no numérico', { ...required, API_PORT: 'http' }],
    ['un puerto fuera de rango', { ...required, API_PORT: '70000' }],
    ['un nivel de registro desconocido', { ...required, LOG_LEVEL: 'verbose' }],
    ['un broker que no es MQTT', { ...required, MQTT_URL: 'http://broker:1883' }],
    ['un identificador MQTT demasiado largo', { ...required, MQTT_CLIENT_ID: 'x'.repeat(65) }],
    [
      'una cuenta de servicio de Firebase que no es JSON',
      { ...required, FCM_SERVICE_ACCOUNT: '{' },
    ],
    [
      'una cuenta de servicio de Firebase incompleta',
      { ...required, FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'x' }) },
    ],
  ])('rechaza %s', (_case, env) => {
    expect(() => validateConfig(env)).toThrow('Configuración no válida');
  });
});
