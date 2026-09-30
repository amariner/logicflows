import { pino } from 'pino';
import { v7 as uuidv7 } from 'uuid';

import { loadConfig } from './config.ts';
import { createRandom } from './domain/random.ts';
import { IncidentGenerator } from './incident-generator.ts';
import { MessageFactory } from './messages.ts';
import { withNetworkChaos } from './mqtt/chaos-connection.ts';
import { connectToBroker } from './mqtt/connection.ts';
import { SCENARIOS } from './scenarios.ts';
import { Simulator } from './simulator.ts';

const HEARTBEAT_MS = 10_000;

const config = loadConfig(process.env);
const logger = pino({
  level: config.logLevel,
  base: { service: 'simulator', siteId: config.siteId, cellId: config.cellId },
});

const sessionId = uuidv7();
const messages = new MessageFactory({
  siteId: config.siteId,
  cellId: config.cellId,
  sessionId,
  newId: uuidv7,
});

const random = createRandom(config.seed);
const scenario = SCENARIOS[config.scenario];

const brokerConnection = connectToBroker({
  ...config.mqtt,
  clientId: `simulator-${config.siteId}-${config.cellId}`,
  will: {
    topic: messages.topic('status'),
    payload: JSON.stringify(messages.status(false, Date.now())),
  },
  logger,
});
const connection =
  scenario.network === null
    ? brokerConnection
    : withNetworkChaos(brokerConnection, scenario.network, random, logger);

const simulator = new Simulator(
  {
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
  { connection, messages, logger, random },
);

const incidents = new IncidentGenerator({
  target: simulator,
  rates: scenario.incidents,
  network: scenario.network === null ? null : { ...scenario.network, connection },
  random,
  logger,
});

logger.info(
  { sessionId, broker: config.mqtt.url, scenario: config.scenario, seed: config.seed },
  'Simulador iniciado',
);
simulator.start();
incidents.start();

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Deteniendo el simulador');
  incidents.stop();
  simulator.stop().then(
    () => process.exit(0),
    (error: unknown) => {
      logger.error({ error: String(error) }, 'Error al detener el simulador');
      process.exit(1);
    },
  );
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
