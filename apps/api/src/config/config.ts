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
  // mqtt:// o mqtts:// por TCP; ws:// o wss:// por WebSocket (ADR-0008).
  MQTT_URL: z.url({ protocol: /^(mqtts?|wss?)$/ }).default('mqtt://127.0.0.1:1883'),
  MQTT_API_USERNAME: z.string().min(1).default('api'),
  MQTT_API_PASSWORD: z.string().min(1),
  /**
   * Identificador del cliente MQTT, propio de cada instancia: el broker
   * desconecta a un cliente cuando otro se conecta con el mismo. Sin valor se
   * deriva del nombre del equipo o del contenedor.
   */
  MQTT_CLIENT_ID: z.string().min(1).max(MAX_CLIENT_ID_LENGTH).optional(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Emisor OpenID Connect de los tokens de acceso (ADR-0009). */
  AUTH_ISSUER: z.url({ protocol: /^https?$/ }),
  /** Audiencia que deben incluir los tokens de acceso. */
  AUTH_AUDIENCE: z.string().min(1).default('logicflows-api'),
  /**
   * Claves públicas del emisor. Sin valor se obtienen con el descubrimiento de
   * OpenID Connect; hace falta cuando la API llega al emisor por otra dirección
   * que el navegador, como dentro de Docker Compose.
   */
  AUTH_JWKS_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** Ruta de los roles dentro del token, separada por puntos. */
  AUTH_ROLES_CLAIM: z.string().min(1).default('realm_access.roles'),
  /**
   * Secreto con el que se firman los tiques del canal de tiempo real. Todas
   * las instancias de la API comparten el mismo, porque un tique pedido a una
   * puede usarse en otra.
   */
  REALTIME_TICKET_SECRET: z.string().min(32),
  /** Peticiones por minuto que admite la API de cada cliente antes de responder 429. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  /**
   * Proxies de confianza delante de la API (balanceador de la plataforma). Con
   * 0 se usa la dirección de la conexión; con 1, la que añade el proxy en
   * X-Forwarded-For. Es necesario para limitar por cliente y no por proxy.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * Secreto con el que Grafana Cloud pide las métricas en /metrics
   * (ADR-0013). Sin valor, la ruta no existe.
   */
  METRICS_TOKEN: z.string().min(32).optional(),
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
