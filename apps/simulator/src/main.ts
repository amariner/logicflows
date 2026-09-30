import { pino } from 'pino';
import { v7 as uuidv7 } from 'uuid';

import { loadConfig } from './config.ts';
import { MessageFactory } from './messages.ts';
import { connectToBroker } from './mqtt/connection.ts';
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

const connection = connectToBroker({
  ...config.mqtt,
  clientId: `simulator-${config.siteId}-${config.cellId}`,
  will: {
    topic: messages.topic('status'),
    payload: JSON.stringify(messages.status(false, Date.now())),
  },
  logger,
});

const simulator = new Simulator(
  {
    format: { layersPerPallet: config.layersPerPallet, boxesPerLayer: config.boxesPerLayer },
    boxIntervalMs: config.boxIntervalMs,
    startupDurationMs: config.startupDurationMs,
    heartbeatMs: HEARTBEAT_MS,
  },
  { connection, messages, logger },
);

logger.info({ sessionId, broker: config.mqtt.url }, 'Simulador iniciado');
simulator.start();

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Deteniendo el simulador');
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
