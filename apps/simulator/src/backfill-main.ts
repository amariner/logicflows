import { pino } from 'pino';
import { v7 as uuidv7 } from 'uuid';

import { backfill } from './backfill.ts';
import { loadConfig } from './config.ts';
import { createRandom } from './domain/random.ts';
import { MessageFactory } from './messages.ts';
import { connectToBroker } from './mqtt/connection.ts';
import { SCENARIOS } from './scenarios.ts';
import type { Scenario } from './scenarios.ts';

/**
 * Carga N días de histórico simulado de una célula (LF-77), hasta ahora:
 *
 *   SIMULATOR_BACKFILL_DAYS=90 pnpm simulator:historico
 *
 * Usa la misma configuración que el simulador (célula, formato, tiempos y
 * escenario). Hay que ejecutarlo con el simulador en directo de esa célula
 * parado y sin datos más recientes en la API (ADR-0004).
 */
const HEARTBEAT_MS = 10_000;
const DAY_MS = 86_400_000;

const days = Number(process.env['SIMULATOR_BACKFILL_DAYS'] ?? '7');
if (!Number.isInteger(days) || days < 1 || days > 120) {
  console.error('SIMULATOR_BACKFILL_DAYS debe ser un entero entre 1 y 120');
  process.exit(2);
}

const config = loadConfig(process.env);
const logger = pino({
  level: config.logLevel,
  base: { service: 'simulator-historico', siteId: config.siteId, cellId: config.cellId },
  formatters: { level: (label) => ({ level: label }) },
});
const scenario: Scenario = SCENARIOS[config.scenario];
const sessionId = uuidv7();
const messages = new MessageFactory({
  siteId: config.siteId,
  cellId: config.cellId,
  sessionId,
  newId: uuidv7,
});

// Sin testamento: una caída de esta carga no debe marcar como desconectada a
// la célula en directo.
const connection = connectToBroker({
  ...config.mqtt,
  clientId: `simulator-historico-${config.siteId}-${config.cellId}`,
  logger,
});

// La telemetría va con QoS 0 y no se encola sin conexión: se espera a estar
// conectado antes de empezar.
await new Promise<void>((resolve) => {
  connection.onConnect(resolve);
});

const toMs = Date.now();
const fromMs = toMs - days * DAY_MS;
logger.info(
  { days, scenario: config.scenario, seed: config.seed, sessionId },
  'Generando el histórico simulado',
);
const started = Date.now();
try {
  const published = await backfill({
    simulator: {
      format: { layersPerPallet: config.layersPerPallet, boxesPerLayer: config.boxesPerLayer },
      boxIntervalMs: config.boxIntervalMs,
      cycleVariation: config.cycleVariation,
      palletChangeMs: config.palletChangeMs,
      startupDurationMs: config.startupDurationMs,
      faultRecoveryMs: config.faultRecoveryMs,
      emergencyStopRecoveryMs: config.emergencyStopRecoveryMs,
      restartDelayMs: config.restartDelayMs,
      heartbeatMs: HEARTBEAT_MS,
    },
    incidents: scenario.incidents,
    script: scenario.script,
    fromMs,
    toMs,
    connection,
    messages,
    random: createRandom(config.seed),
    logger,
  });
  logger.info(
    { published, seconds: Math.round((Date.now() - started) / 1000) },
    'Histórico simulado publicado',
  );
} finally {
  await connection.close();
}
