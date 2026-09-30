import { z } from 'zod';

const configSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
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
