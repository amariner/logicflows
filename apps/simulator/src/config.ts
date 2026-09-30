import { cellIdSchema, siteIdSchema } from '@logicflows/contract';
import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();

const configSchema = z.object({
  MQTT_URL: z.url({ protocol: /^mqtts?$/ }).default('mqtt://127.0.0.1:1883'),
  MQTT_SIMULATOR_USERNAME: z.string().min(1).default('simulator'),
  MQTT_SIMULATOR_PASSWORD: z.string().min(1),
  SIMULATOR_SITE_ID: siteIdSchema.default('demo'),
  SIMULATOR_CELL_ID: cellIdSchema.default('cell-01'),
  SIMULATOR_BOX_INTERVAL_MS: positiveInt.default(4_000),
  SIMULATOR_STARTUP_DURATION_MS: positiveInt.default(3_000),
  SIMULATOR_CYCLE_VARIATION: z.coerce.number().min(0).max(0.5).default(0.1),
  SIMULATOR_PALLET_CHANGE_MS: z.coerce.number().int().nonnegative().default(8_000),
  SIMULATOR_SEED: z.coerce.number().int().optional(),
  SIMULATOR_LAYERS_PER_PALLET: positiveInt.default(5),
  SIMULATOR_BOXES_PER_LAYER: positiveInt.default(8),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export interface SimulatorConfig {
  readonly mqtt: { readonly url: string; readonly username: string; readonly password: string };
  readonly siteId: string;
  readonly cellId: string;
  readonly boxIntervalMs: number;
  readonly startupDurationMs: number;
  readonly cycleVariation: number;
  readonly palletChangeMs: number;
  /** Semilla para repetir una simulación. Sin ella, cada ejecución varía. */
  readonly seed: number | undefined;
  readonly layersPerPallet: number;
  readonly boxesPerLayer: number;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/** Lee y valida la configuración desde las variables de entorno. */
export function loadConfig(env: Record<string, string | undefined>): SimulatorConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuración no válida:\n${z.prettifyError(result.error)}`);
  }
  const c = result.data;
  return {
    mqtt: {
      url: c.MQTT_URL,
      username: c.MQTT_SIMULATOR_USERNAME,
      password: c.MQTT_SIMULATOR_PASSWORD,
    },
    siteId: c.SIMULATOR_SITE_ID,
    cellId: c.SIMULATOR_CELL_ID,
    boxIntervalMs: c.SIMULATOR_BOX_INTERVAL_MS,
    startupDurationMs: c.SIMULATOR_STARTUP_DURATION_MS,
    cycleVariation: c.SIMULATOR_CYCLE_VARIATION,
    palletChangeMs: c.SIMULATOR_PALLET_CHANGE_MS,
    seed: c.SIMULATOR_SEED,
    layersPerPallet: c.SIMULATOR_LAYERS_PER_PALLET,
    boxesPerLayer: c.SIMULATOR_BOXES_PER_LAYER,
    logLevel: c.LOG_LEVEL,
  };
}
