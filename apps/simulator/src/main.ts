import { pino } from 'pino';
import { v7 as uuidv7 } from 'uuid';

import { cellProfile, cellSeed, scriptForCell } from './cells.ts';
import { loadConfig } from './config.ts';
import type { SimulatorConfig } from './config.ts';
import { ScriptedIncidents } from './daily-script.ts';
import { createRandom } from './domain/random.ts';
import { IncidentGenerator } from './incident-generator.ts';
import { MessageFactory } from './messages.ts';
import { withNetworkChaos } from './mqtt/chaos-connection.ts';
import { connectToBroker } from './mqtt/connection.ts';
import { SCENARIOS } from './scenarios.ts';
import type { Scenario } from './scenarios.ts';
import { Simulator } from './simulator.ts';

const HEARTBEAT_MS = 10_000;

const config = loadConfig(process.env);
const logger = pino({
  level: config.logLevel,
  base: { service: 'simulator', siteId: config.siteId },
  // Railway filtra por nivel solo si es texto: «info», no 30 (ADR-0013).
  formatters: { level: (label) => ({ level: label }) },
});
const scenario: Scenario = SCENARIOS[config.scenario];

/**
 * Arranca una célula: su conexión con el broker, con su propio testamento, su
 * sesión, su simulador y sus incidencias (LF-123). Devuelve cómo detenerla.
 */
function startCell(cellId: string, index: number, config: SimulatorConfig): () => Promise<void> {
  const profile = cellProfile(index);
  const cellLogger = logger.child({ cellId });
  const sessionId = uuidv7();
  const messages = new MessageFactory({ siteId: config.siteId, cellId, sessionId, newId: uuidv7 });
  const seed = cellSeed(config.seed, index);
  const random = createRandom(seed);

  const brokerConnection = connectToBroker({
    ...config.mqtt,
    clientId: `simulator-${config.siteId}-${cellId}`,
    will: {
      topic: messages.topic('status'),
      payload: JSON.stringify(messages.status(false, Date.now())),
    },
    logger: cellLogger,
  });
  const connection =
    scenario.network === null
      ? brokerConnection
      : withNetworkChaos(brokerConnection, scenario.network, random, cellLogger);

  const simulator = new Simulator(
    {
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
    { connection, messages, logger: cellLogger, random },
  );

  const incidents = new IncidentGenerator({
    target: simulator,
    rates: scenario.incidents,
    network: scenario.network === null ? null : { ...scenario.network, connection },
    random,
    logger: cellLogger,
  });
  const scripted =
    scenario.script === undefined
      ? undefined
      : new ScriptedIncidents({
          target: simulator,
          script: scriptForCell(scenario.script, profile),
          logger: cellLogger,
        });

  cellLogger.info({ sessionId, seed, profile }, 'Célula iniciada');
  simulator.start();
  incidents.start();
  scripted?.start();

  return () => {
    incidents.stop();
    scripted?.stop();
    return simulator.stop();
  };
}

logger.info(
  { broker: config.mqtt.url, scenario: config.scenario, seed: config.seed, cells: config.cells },
  'Simulador iniciado',
);
const stops = config.cells.map((cellId, index) => startCell(cellId, index, config));

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Deteniendo el simulador');
  Promise.all(stops.map((stop) => stop())).then(
    () => process.exit(0),
    (error: unknown) => {
      logger.error({ error: String(error) }, 'Error al detener el simulador');
      process.exit(1);
    },
  );
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
