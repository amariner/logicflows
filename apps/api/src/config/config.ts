import { hostname } from 'node:os';

import { z } from 'zod';

const CLIENT_ID_PREFIX = 'logicflows-api-';
const MAX_CLIENT_ID_LENGTH = 64;

/**
 * Identificador MQTT por defecto de una instancia: único entre instancias
 * (cada contenedor tiene su propio nombre) y estable mientras vive, para que
 * el broker conserve su sesión persistente entre reconexiones.
 */
export function defaultClientId(host: string): string {
  const safeHost = host
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${CLIENT_ID_PREFIX}${safeHost || 'local'}`.slice(0, MAX_CLIENT_ID_LENGTH);
}

const configSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MQTT_URL: z.url({ protocol: /^mqtts?$/ }).default('mqtt://127.0.0.1:1883'),
  MQTT_API_USERNAME: z.string().min(1).default('api'),
  MQTT_API_PASSWORD: z.string().min(1),
  /**
   * Identificador del cliente MQTT, propio de cada instancia: el broker
   * desconecta a un cliente cuando otro se conecta con el mismo. Sin valor se
   * deriva del nombre del equipo o del contenedor.
   */
  MQTT_CLIENT_ID: z.string().min(1).max(MAX_CLIENT_ID_LENGTH).optional(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Orígenes autorizados a llamar a la API desde el navegador, separados por comas. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(z.url())),
});

export type AppConfig = z.infer<typeof configSchema> & { MQTT_CLIENT_ID: string };

/**
 * Valida las variables de entorno al arrancar. Una configuración no válida
 * detiene la API con un mensaje que indica qué variable falla.
 */
export function validateConfig(env: Record<string, unknown>, host = hostname()): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuración no válida:\n${z.prettifyError(result.error)}`);
  }
  return { ...result.data, MQTT_CLIENT_ID: result.data.MQTT_CLIENT_ID ?? defaultClientId(host) };
}
