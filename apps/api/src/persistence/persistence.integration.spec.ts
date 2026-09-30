import type { INestApplication } from '@nestjs/common';
import { decodeMessage } from '@logicflows/contract';
import type { DecodedMessage } from '@logicflows/contract';
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
import { MqttIngestionService } from '../ingestion/mqtt-ingestion.service.ts';
import { CellStateStore } from '../realtime/cell-state.store.ts';
import { createApp } from '../testing/app.ts';
import {
  API_PASSWORD,
  SIMULATOR_PASSWORD,
  eventually,
  freePort,
  startBroker,
  waitFor,
} from '../testing/broker.ts';
import type { TestBroker } from '../testing/broker.ts';
import { startDatabase } from '../testing/database.ts';
import { TelemetryRepository } from './telemetry.repository.ts';

const SESSION_A = testUuid(10);
const SESSION_B = testUuid(11);

const telemetry = (sessionId: string, seq: number, boxesTotal: number, minute: number) =>
  buildTelemetryMessage({
    sessionId,
    seq,
    messageId: testUuid(1000 + seq + (sessionId === SESSION_B ? 500 : 0)),
    boxesTotal,
    palletsTotal: Math.floor(boxesTotal / 40),
    timestamp: `2026-10-05T08:${String(minute).padStart(2, '0')}:00.000Z`,
  });

const decoded = (kind: string, message: object): DecodedMessage => {
  const result = decodeMessage(`logicflows/v1/demo/cell-01/${kind}`, JSON.stringify(message));
  if (!result.ok) {
    throw new Error(result.detail);
  }
  return result;
};

describe('persistencia en PostgreSQL', () => {
  let broker: TestBroker;
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let publisher: MqttClient;
  let pool: Pool;
  let repository: TelemetryRepository;

  const count = async (table: string) => {
    const result = await pool.query<{ n: string }>(`select count(*) as n from ${table}`);
    return Number(result.rows[0]?.n);
  };
  const publish = (kind: string, message: object) =>
    publisher.publishAsync(`logicflows/v1/demo/cell-01/${kind}`, JSON.stringify(message), {
      qos: 1,
    });

  beforeAll(async () => {
    [broker, database] = await Promise.all([startBroker(), startDatabase()]);
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.url,
      MQTT_API_PASSWORD: API_PASSWORD,
    });
    pool = app.get<Pool>(POOL);
    repository = app.get(TelemetryRepository);
    await waitFor(() => app.get(MqttIngestionService).connected);
    publisher = await mqtt.connectAsync(broker.url, {
      protocolVersion: 5,
      username: 'simulator',
      password: SIMULATOR_PASSWORD,
    });
  });

  afterAll(async () => {
    await publisher.endAsync();
    await app.close();
    await Promise.all([broker.container.stop(), database.stop()]);
  });

  it('aplica las migraciones al arrancar', async () => {
    const tables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['cell_state_changes', 'cell_status_events', 'telemetry_samples']),
    );
  });

  it('guarda cada mensaje aceptado por la ingesta', async () => {
    await publish('status', buildStatusMessage({ sessionId: SESSION_A }));
    await publish(
      'state',
      buildStateMessage({
        sessionId: SESSION_A,
        seq: 0,
        state: 'FAULT',
        event: 'fault',
        previousState: 'RUNNING',
        activeAlarms: [
          {
            code: 'ROB-001',
            severity: 'HIGH',
            message: 'Colisión del robot detectada',
            raisedAt: '2026-10-05T08:00:00.000Z',
          },
        ],
      }),
    );
    for (const [seq, boxes] of [0, 1, 2].entries()) {
      await publish('telemetry', telemetry(SESSION_A, seq, boxes, seq));
    }
    await eventually(async () => {
      expect(await count('cell_status_events')).toBe(1);
      expect(await count('cell_state_changes')).toBe(1);
      expect(await count('telemetry_samples')).toBe(3);
    });
    const state = await pool.query<{ state: string; active_alarms: unknown }>(
      'select state, active_alarms from cell_state_changes',
    );
    expect(state.rows[0]).toMatchObject({ state: 'FAULT', active_alarms: [{ code: 'ROB-001' }] });
  });

  it('un mensaje duplicado no se guarda dos veces ni altera la producción', async () => {
    const from = new Date('2026-10-05T08:00:00.000Z');
    const to = new Date('2026-10-05T09:00:00.000Z');
    const before = await repository.production('demo', 'cell-01', from, to);

    // La guardia de la ingesta ya descarta los duplicados: se prueba la base
    // de datos directamente, como si la API se hubiera reiniciado.
    const duplicate = decoded('telemetry', telemetry(SESSION_A, 2, 2, 2));
    expect(await repository.save(duplicate, new Date().toISOString())).toBe(false);

    expect(await count('telemetry_samples')).toBe(3);
    expect(await repository.production('demo', 'cell-01', from, to)).toEqual(before);
  });

  it('calcula la producción por diferencias de contadores en cada sesión', async () => {
    // Sesión A: 0 → 1 → 2 (minutos 0-2). Sesión B tras un reinicio: 0 → 5 → 9 (minutos 10-12).
    for (const [seq, [boxes, minute]] of [
      [0, 10],
      [5, 11],
      [9, 12],
    ].entries()) {
      await repository.save(
        decoded('telemetry', telemetry(SESSION_B, seq, boxes ?? 0, minute ?? 0)),
        new Date().toISOString(),
      );
    }
    const production = (fromMinute: number, toMinute: number) =>
      repository.production(
        'demo',
        'cell-01',
        new Date(`2026-10-05T08:${String(fromMinute).padStart(2, '0')}:00.000Z`),
        new Date(`2026-10-05T08:${String(toMinute).padStart(2, '0')}:00.000Z`),
      );

    expect((await production(0, 30)).boxes).toBe(2 + 9);
    expect((await production(11, 13)).boxes).toBe(9);
    // Solo la diferencia de la muestra del minuto 11 respecto a la del 10.
    expect((await production(11, 12)).boxes).toBe(5);
    expect((await production(20, 30)).boxes).toBe(0);
  });

  it('tras reiniciarse, la API recupera la última información de cada célula', async () => {
    // Segunda instancia sin broker disponible: solo puede obtenerla de la base de datos.
    const port = await freePort();
    const restarted = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: `mqtt://127.0.0.1:${String(port)}`,
      MQTT_API_PASSWORD: 'x',
      MQTT_CLIENT_ID: 'logicflows-api-restarted',
    });
    const [cell] = restarted.get(CellStateStore).snapshot();
    expect(cell).toMatchObject({
      siteId: 'demo',
      cellId: 'cell-01',
      status: { online: true, sessionId: SESSION_A },
      state: { state: 'FAULT', activeAlarms: [{ code: 'ROB-001' }] },
      telemetry: { sessionId: SESSION_B, boxesTotal: 9 },
    });
    await restarted.close();
  });
});
