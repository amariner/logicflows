import mqtt from 'mqtt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { API_PASSWORD, SIMULATOR_PASSWORD, eventually, startBroker } from '../testing/broker.ts';
import type { TestBroker } from '../testing/broker.ts';

/** Más de los 1 000 que guarda Mosquitto por defecto. */
const MESSAGES = 3_000;

describe('cola del broker durante una caída de la API (LF-90)', () => {
  let broker: TestBroker;

  beforeAll(async () => {
    broker = await startBroker();
  });

  afterAll(async () => {
    await broker.container.stop();
  });

  it('guarda para la sesión persistente de la API todo lo publicado mientras no está', async () => {
    const api = {
      protocolVersion: 5 as const,
      username: 'api',
      password: API_PASSWORD,
      clientId: 'logicflows-api-cola',
      clean: false,
      properties: { sessionExpiryInterval: 3_600 },
    };
    const first = await mqtt.connectAsync(broker.url, api);
    await first.subscribeAsync('logicflows/v1/#', { qos: 1 });
    await first.endAsync();

    const simulator = await mqtt.connectAsync(broker.url, {
      protocolVersion: 5,
      username: 'simulator',
      password: SIMULATOR_PASSWORD,
    });
    for (let index = 0; index < MESSAGES; index++) {
      await simulator.publishAsync('logicflows/v1/demo/cell-cola/telemetry', String(index), {
        qos: 1,
      });
    }
    await simulator.endAsync();

    const received = new Set<string>();
    const back = mqtt.connect(broker.url, api);
    back.on('message', (_topic, payload) => received.add(payload.toString()));
    try {
      await eventually(() => {
        expect(received.size).toBe(MESSAGES);
        return Promise.resolve();
      }, 30_000);
    } finally {
      await back.endAsync();
    }
  });
});
