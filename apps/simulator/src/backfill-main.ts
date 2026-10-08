import { pino } from 'pino';
import { v7 as uuidv7 } from 'uuid';

import { backfill } from './backfill.ts';
import { cellProfile, cellSeed, scriptForCell } from './cells.ts';
import { loadConfig } from './config.ts';
import { createRandom } from './domain/random.ts';
import { MessageFactory } from './messages.ts';
import { connectToBroker } from './mqtt/connection.ts';
import { SCENARIOS } from './scenarios.ts';
import type { Scenario } from './scenarios.ts';

/**
 * Carga N días de histórico simulado de las células (LF-77, LF-123), hasta ahora:
 *
 *   SIMULATOR_BACKFILL_DAYS=90 pnpm simulator:historico
 *
 * Con SIMULATOR_BACKFILL_CELLS, solo esas células: por ejemplo, las que se
 * añaden a una planta que ya tiene histórico.
 *
 * Usa la misma configuración que el simulador (células, formato, tiempos y
 * escenario), con el perfil de cada célula. Hay que ejecutarlo con el
 * simulador en directo de esas células parado y sin datos más recientes en
 * la API (ADR-0004).
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
  base: { service: 'simulator-historico', siteId: config.siteId },
  formatters: { level: (label) => ({ level: label }) },
});
const scenario: Scenario = SCENARIOS[config.scenario];
const toMs = Date.now();
const fromMs = toMs - days * DAY_MS;

/** Genera el histórico de una célula, con su sesión, su conexión y su perfil (LF-123). */
async function backfillCell(cellId: string, index: number): Promise<void> {
  const profile = cellProfile(index);
  const cellLogger = logger.child({ cellId });
  const sessionId = uuidv7();
  const messages = new MessageFactory({ siteId: config.siteId, cellId, sessionId, newId: uuidv7 });

  // Sin testamento: una caída de esta carga no debe marcar como desconectada a
  // la célula en directo.
  const connection = connectToBroker({
    ...config.mqtt,
    clientId: `simulator-historico-${config.siteId}-${cellId}`,
    logger: cellLogger,
  });

  // La telemetría va con QoS 0 y no se encola sin conexión: se espera a estar
  // conectado antes de empezar.
  await new Promise<void>((resolve) => {
    connection.onConnect(resolve);
  });

  const seed = cellSeed(config.seed, index);
  cellLogger.info(
    { days, scenario: config.scenario, seed, sessionId, profile },
    'Generando el histórico simulado',
  );
  const started = Date.now();
  try {
    const published = await backfill({
      simulator: {
        format: { layersPerPallet: config.layersPerPallet, boxesPerLayer: config.boxesPerLayer },
        boxIntervalMs: Math.round(config.boxIntervalMs * profile.cycleFactor),
        cycleVariation: config.cycleVariation,
        palletChangeMs: config.palletChangeMs,
        startupDurationMs: config.startupDurationMs,
        faultRecoveryMs: config.faultRecoveryMs,
        emergencyStopRecoveryMs: config.emergencyStopRecoveryMs,
        restartDelayMs: config.restartDelayMs,
        heartbeatMs: HEARTBEAT_MS,
      },
      incidents: scenario.incidents,
      script: scenario.script === undefined ? undefined : scriptForCell(scenario.script, profile),
      fromMs,
      toMs,
      connection,
      messages,
      random: createRandom(seed),
      logger: cellLogger,
    });
    cellLogger.info(
      { published, seconds: Math.round((Date.now() - started) / 1000) },
      'Histórico simulado publicado',
    );
  } finally {
    await connection.close();
  }
}

// Solo algunas células, por ejemplo las que se añaden a una planta que ya
// tiene histórico: cada una conserva el perfil de su posición en las células.
const only = (process.env['SIMULATOR_BACKFILL_CELLS'] ?? '')
  .split(',')
  .map((cell) => cell.trim())
  .filter((cell) => cell !== '');
const unknown = only.filter((cell) => !config.cells.includes(cell));
if (unknown.length > 0) {
  console.error(`SIMULATOR_BACKFILL_CELLS incluye células que no simula: ${unknown.join(', ')}`);
  process.exit(2);
}

// Una célula detrás de otra: la API las recibe en orden y sin picos.
for (const [index, cellId] of config.cells.entries()) {
  if (only.length === 0 || only.includes(cellId)) {
    await backfillCell(cellId, index);
  }
}
