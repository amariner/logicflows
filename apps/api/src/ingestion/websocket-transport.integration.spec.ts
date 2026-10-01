import type { INestApplication } from '@nestjs/common';
import { buildStateMessage } from '@logicflows/contract/testing';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CellStateStore } from '../realtime/cell-state.store.ts';
import { createApp } from '../testing/app.ts';
import {
  API_PASSWORD,
  SIMULATOR_PASSWORD,
  eventually,
  startBroker,
  waitFor,
} from '../testing/broker.ts';
import type { TestBroker } from '../testing/broker.ts';
import { startDatabase } from '../testing/database.ts';
import { MqttIngestionService } from './mqtt-ingestion.service.ts';

describe('MQTT sobre WebSocket (ADR-0008)', () => {
  let broker: TestBroker;
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let cell: MqttClient;

  beforeAll(async () => {
    [broker, database] = await Promise.all([startBroker(), startDatabase()]);
    // La API y la célula usan el listener WebSocket del broker, como en producción.
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.webSocketUrl,
      MQTT_API_PASSWORD: API_PASSWORD,
    });
    await waitFor(() => app.get(MqttIngestionService).connected);
    cell = await mqtt.connectAsync(broker.webSocketUrl, {
      protocolVersion: 5,
      username: 'simulator',
      password: SIMULATOR_PASSWORD,
    });
  });

  afterAll(async () => {
    await cell.endAsync();
    await app.close();
    await Promise.all([broker.container.stop(), database.stop()]);
  });

  it('una célula publica por WebSocket y la API lo recibe con autenticación y ACL', async () => {
    await cell.publishAsync(
      'logicflows/v1/demo/cell-01/state',
      JSON.stringify(buildStateMessage({ seq: 1, state: 'RUNNING' })),
      { qos: 1 },
    );
    await eventually(() => {
      expect(app.get(CellStateStore).snapshot()).toMatchObject([
        { cellId: 'cell-01', state: { state: 'RUNNING' } },
      ]);
      return Promise.resolve();
    });
  });

  it('el listener WebSocket también rechaza a los clientes sin credenciales', async () => {
    await expect(
      mqtt.connectAsync(broker.webSocketUrl, {
        protocolVersion: 5,
        reconnectPeriod: 0,
        connectTimeout: 3_000,
      }),
    ).rejects.toThrow();
  });
});
