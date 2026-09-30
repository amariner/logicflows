import { z } from 'zod';

const configSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MQTT_URL: z.url({ protocol: /^mqtts?$/ }).default('mqtt://127.0.0.1:1883'),
  MQTT_API_USERNAME: z.string().min(1).default('api'),
  MQTT_API_PASSWORD: z.string().min(1),
  /** Identificador estable: el broker conserva la sesión persistente asociada a él. */
  MQTT_CLIENT_ID: z.string().min(1).default('logicflows-api'),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Valida las variables de entorno al arrancar. Una configuración no válida
 * detiene la API con un mensaje que indica qué variable falla.
 */
export function validateConfig(env: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuración no válida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
