import { cellIdSchema, siteIdSchema } from '@logicflows/contract';
import { z } from 'zod';

import { SCENARIO_NAMES } from './scenarios.ts';
import type { ScenarioName } from './scenarios.ts';

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
  SIMULATOR_SCENARIO: z.enum(SCENARIO_NAMES).default('normal'),
  SIMULATOR_FAULT_RECOVERY_MS: positiveInt.default(20_000),
  SIMULATOR_EMERGENCY_STOP_RECOVERY_MS: positiveInt.default(30_000),
  SIMULATOR_RESTART_DELAY_MS: positiveInt.default(5_000),
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
  readonly scenario: ScenarioName;
  readonly faultRecoveryMs: number;
  readonly emergencyStopRecoveryMs: number;
  readonly restartDelayMs: number;
  readonly layersPerPallet: number;
  readonly boxesPerLayer: number;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/** Lee y valida la configuración desde las variables de entorno. */
export function loadConfig(env: Record<string, string | undefined>): SimulatorConfig {
  // Una variable definida sin valor (`SIMULATOR_SEED=`) cuenta como no definida.
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = configSchema.safeParse(defined);
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
    scenario: c.SIMULATOR_SCENARIO,
    faultRecoveryMs: c.SIMULATOR_FAULT_RECOVERY_MS,
    emergencyStopRecoveryMs: c.SIMULATOR_EMERGENCY_STOP_RECOVERY_MS,
    restartDelayMs: c.SIMULATOR_RESTART_DELAY_MS,
    layersPerPallet: c.SIMULATOR_LAYERS_PER_PALLET,
    boxesPerLayer: c.SIMULATOR_BOXES_PER_LAYER,
    logLevel: c.LOG_LEVEL,
  };
}
