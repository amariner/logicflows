import type { INestApplication } from '@nestjs/common';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
  testUuid,
} from '@logicflows/contract/testing';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POOL } from '../database/database.module.ts';
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

const SESSION = testUuid(20);

describe('varias instancias de la API', () => {
  let broker: TestBroker;
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let instances: INestApplication[];
  let publisher: MqttClient;

  const publish = (kind: string, message: object) =>
    publisher.publishAsync(`logicflows/v1/demo/cell-01/${kind}`, JSON.stringify(message), {
      qos: 1,
    });

  beforeAll(async () => {
    [broker, database] = await Promise.all([startBroker(), startDatabase()]);
    const env = {
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.url,
      MQTT_API_PASSWORD: API_PASSWORD,
    };
    // Como dos contenedores: cada instancia tiene su propio identificador MQTT.
    instances = [
      await createApp({ ...env, MQTT_CLIENT_ID: 'logicflows-api-instancia-a' }),
      await createApp({ ...env, MQTT_CLIENT_ID: 'logicflows-api-instancia-b' }),
    ];
    for (const instance of instances) {
      await waitFor(() => instance.get(MqttIngestionService).connected);
    }
    publisher = await mqtt.connectAsync(broker.url, {
      protocolVersion: 5,
      username: 'simulator',
      password: SIMULATOR_PASSWORD,
    });
  });

  afterAll(async () => {
    await publisher.endAsync();
    await Promise.all(instances.map((instance) => instance.close()));
    await Promise.all([broker.container.stop(), database.stop()]);
  });

  it('ambas instancias siguen conectadas y reciben todos los mensajes', async () => {
    await publish('status', buildStatusMessage({ sessionId: SESSION }));
    await publish('state', buildStateMessage({ sessionId: SESSION, seq: 0 }));
    for (const seq of [0, 1, 2]) {
      await publish(
        'telemetry',
        buildTelemetryMessage({
          sessionId: SESSION,
          seq,
          boxesTotal: seq,
          messageId: testUuid(300 + seq),
        }),
      );
    }

    await eventually(() => {
      for (const instance of instances) {
        const [cell] = instance.get(CellStateStore).snapshot();
        expect(cell).toMatchObject({
          status: { online: true },
          state: { state: 'RUNNING' },
          telemetry: { boxesTotal: 2 },
        });
      }
      return Promise.resolve();
    });
    for (const instance of instances) {
      expect(instance.get(MqttIngestionService).connected).toBe(true);
    }
  });

  it('cada mensaje se guarda una sola vez aunque lo reciban las dos instancias', async () => {
    const pool = instances[0]?.get<Pool>(POOL);
    const count = async (table: string) => {
      const result = await pool?.query<{ n: string }>(`select count(*) as n from ${table}`);
      return Number(result?.rows[0]?.n);
    };
    await eventually(async () => {
      expect(await count('cell_status_events')).toBe(1);
      expect(await count('cell_state_changes')).toBe(1);
      expect(await count('telemetry_samples')).toBe(3);
    });
  });
});
