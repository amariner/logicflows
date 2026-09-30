import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { decodeMessage, subscriptionFilter } from '@logicflows/contract';
import type { StateMessage, StatusMessage, TelemetryMessage } from '@logicflows/contract';
import mqtt from 'mqtt';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MessageFactory } from './messages.ts';
import { connectToBroker } from './mqtt/connection.ts';
import { Simulator } from './simulator.ts';

const infra = (file: string) =>
  fileURLToPath(new URL(`../../../infra/mosquitto/${file}`, import.meta.url));
const API_PASSWORD = 'api-test';
const SIMULATOR_PASSWORD = 'simulator-test';
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Puerto libre del equipo: se fija para que no cambie al reiniciar el broker. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address !== null) {
          resolve(address.port);
        } else {
          reject(new Error('Sin puerto'));
        }
      });
    });
  });

interface Received {
  status: StatusMessage[];
  state: StateMessage[];
  telemetry: TelemetryMessage[];
}

const waitFor = async (condition: () => boolean, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Tiempo de espera agotado');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

describe('simulador con un broker real', () => {
  let broker: StartedTestContainer;
  let url: string;

  beforeAll(async () => {
    const port = await freePort();
    broker = await new GenericContainer('eclipse-mosquitto:2.1.2-alpine')
      .withCopyFilesToContainer([
        { source: infra('mosquitto.conf'), target: '/mosquitto/config/mosquitto.conf' },
        { source: infra('acl'), target: '/mosquitto/config/acl' },
        { source: infra('init.sh'), target: '/mosquitto/init/init.sh' },
      ])
      .withEnvironment({
        MQTT_API_PASSWORD: API_PASSWORD,
        MQTT_SIMULATOR_PASSWORD: SIMULATOR_PASSWORD,
      })
      .withCommand(['/bin/sh', '/mosquitto/init/init.sh'])
      .withExposedPorts({ container: 1883, host: port })
      .withWaitStrategy(Wait.forLogMessage(/mosquitto version .* running/))
      .start();
    url = `mqtt://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await broker.stop();
  });

  it('publica mensajes válidos y se recupera cuando el broker se reinicia', async () => {
    const received: Received = { status: [], state: [], telemetry: [] };
    const consumer = await mqtt.connectAsync(url, {
      protocolVersion: 5,
      username: 'api',
      password: API_PASSWORD,
      reconnectPeriod: 200,
    });
    consumer.on('message', (topic, payload) => {
      const decoded = decodeMessage(topic, payload.toString());
      if (!decoded.ok) {
        throw new Error(`Mensaje fuera del contrato: ${decoded.detail}`);
      }
      (received[decoded.kind] as unknown[]).push(decoded.message);
    });
    consumer.on('connect', () => {
      void consumer.subscribeAsync(subscriptionFilter(), { qos: 1 });
    });
    await consumer.subscribeAsync(subscriptionFilter(), { qos: 1 });

    const messages = new MessageFactory({
      siteId: 'demo',
      cellId: 'cell-01',
      sessionId: uuidv7(),
      newId: uuidv7,
    });
    const connection = connectToBroker({
      url,
      username: 'simulator',
      password: SIMULATOR_PASSWORD,
      clientId: 'simulator-test',
      will: {
        topic: messages.topic('status'),
        payload: JSON.stringify(messages.status(false, Date.now())),
      },
      logger,
      reconnectPeriodMs: 200,
    });
    const simulator = new Simulator(
      {
        format: { layersPerPallet: 5, boxesPerLayer: 8 },
        boxIntervalMs: 100,
        cycleVariation: 0.1,
        palletChangeMs: 200,
        startupDurationMs: 100,
        heartbeatMs: 10_000,
      },
      { connection, messages, logger },
    );

    simulator.start();
    await waitFor(() => (received.telemetry.at(-1)?.boxesTotal ?? 0) >= 3);
    expect(received.status[0]).toMatchObject({ online: true });
    expect(received.state.map((s) => s.state)).toContain('RUNNING');

    const boxesBeforeRestart = received.telemetry.at(-1)?.boxesTotal ?? 0;
    const statusBeforeRestart = received.status.length;
    await broker.restart();

    await waitFor(() => received.status.length > statusBeforeRestart);
    await waitFor(() => (received.telemetry.at(-1)?.boxesTotal ?? 0) > boxesBeforeRestart + 3);
    expect(received.status.at(-1)).toMatchObject({ online: true });

    await simulator.stop();
    await waitFor(() => received.status.at(-1)?.online === false);
    await consumer.endAsync();
  });
});
