import type { INestApplication } from '@nestjs/common';
import type { Alarm } from '@logicflows/contract';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
  testUuid,
} from '@logicflows/contract/testing';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { Pool, QueryResultRow } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';

import type { AppConfig } from '../config/config.ts';
import { DATABASE, POOL } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import { MqttIngestionService } from '../ingestion/mqtt-ingestion.service.ts';
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
import { HistoryAggregator } from './history-aggregator.ts';
import { RetentionService } from './retention.service.ts';

const SESSION_A = testUuid(30);
const SESSION_B = testUuid(31);
const CELL = 'cell-hist';
const at = (hhmm: string) => `2026-09-10T${hhmm}:00.000Z`;

const rob: Alarm = {
  code: 'ROB-001',
  severity: 'HIGH',
  message: 'Colisión del robot detectada',
  raisedAt: at('09:20'),
};

describe('histórico agregado por hora (LF-79)', () => {
  let broker: TestBroker;
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let publisher: MqttClient;
  let pool: Pool;
  let id = 5000;

  const publish = (kind: string, message: object) =>
    publisher.publishAsync(`logicflows/v1/demo/${CELL}/${kind}`, JSON.stringify(message), {
      qos: 1,
    });
  const telemetry = (sessionId: string, seq: number, hhmm: string, boxesTotal: number) =>
    publish(
      'telemetry',
      buildTelemetryMessage({
        cellId: CELL,
        sessionId,
        seq,
        messageId: testUuid(id++),
        timestamp: at(hhmm),
        boxesTotal,
        palletsTotal: Math.floor(boxesTotal / 40),
      }),
    );
  const query = async <T extends QueryResultRow = QueryResultRow>(text: string): Promise<T[]> =>
    (await pool.query<T>(text)).rows;
  const hourRow = async (hour: string) =>
    (
      await pool.query<{
        boxes: number;
        pallets: number;
        seconds: Record<string, number>;
        stops: object;
      }>(
        `select boxes, pallets, seconds, stops from cell_hourly where cell_id = '${CELL}' and hour = '${hour}'`,
      )
    ).rows[0];
  const settled = () =>
    eventually(async () => {
      const [row] = await query<{ n: string }>(
        `select count(*) as n from telemetry_samples where cell_id = '${CELL}'`,
      );
      expect(Number(row?.n)).toBeGreaterThan(0);
    });

  beforeAll(async () => {
    [broker, database] = await Promise.all([startBroker(), startDatabase()]);
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.url,
      MQTT_API_PASSWORD: API_PASSWORD,
      HISTORY_AGGREGATION_INTERVAL_MS: '3600000',
    });
    pool = app.get<Pool>(POOL);
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

  it('cada mensaje guardado deja su hora pendiente de agregar', async () => {
    await publish(
      'status',
      buildStatusMessage({
        cellId: CELL,
        sessionId: SESSION_A,
        timestamp: at('08:55'),
        online: true,
      }),
    );
    await publish(
      'state',
      buildStateMessage({
        cellId: CELL,
        sessionId: SESSION_A,
        seq: 0,
        timestamp: at('08:55'),
        since: at('08:55'),
        state: 'RUNNING',
        event: 'started',
        previousState: 'STARTING',
        activeAlarms: [],
      }),
    );
    await telemetry(SESSION_A, 0, '08:55', 100);
    await telemetry(SESSION_A, 1, '09:10', 300);
    await publish(
      'state',
      buildStateMessage({
        cellId: CELL,
        sessionId: SESSION_A,
        seq: 1,
        timestamp: at('09:20'),
        since: at('09:20'),
        state: 'FAULT',
        event: 'fault',
        previousState: 'RUNNING',
        activeAlarms: [rob],
      }),
    );
    await publish(
      'state',
      buildStateMessage({
        cellId: CELL,
        sessionId: SESSION_A,
        seq: 2,
        timestamp: at('09:30'),
        since: at('09:30'),
        state: 'STOPPED',
        event: 'reset',
        previousState: 'FAULT',
        activeAlarms: [],
      }),
    );
    await telemetry(SESSION_A, 2, '09:30', 450);
    await settled();
    await eventually(async () => {
      const hours = await query<{ hour: Date }>(
        `select hour from cell_hourly_pending where cell_id = '${CELL}' order by hour`,
      );
      expect(hours.map((row) => row.hour.toISOString())).toEqual([
        at('08:00'),
        at('09:00'),
        at('10:00'),
      ]);
    });
  });

  it('agrega cada hora con su producción, sus segundos por situación y sus paradas', async () => {
    expect(await app.get(HistoryAggregator).runOnce()).toBe(3);
    // 09:00: de 100 (08:55) a 450 (09:30), dentro de la misma sesión.
    expect(await hourRow(at('09:00'))).toEqual({
      boxes: 350,
      pallets: 11 - 2,
      seconds: { RUNNING: 20 * 60, FAULT: 10 * 60, STOPPED: 30 * 60 },
      stops: { 'FAULT:ROB-001': { seconds: 600, count: 1 } },
    });
    // La primera muestra de la sesión cuenta desde cero.
    expect((await hourRow(at('08:00')))?.boxes).toBe(100);
    expect((await hourRow(at('10:00')))?.seconds).toEqual({ STOPPED: 3600 });
    expect(await query(`select 1 from cell_hourly_pending where cell_id = '${CELL}'`)).toEqual([]);
  });

  it('un mensaje que llega tarde vuelve a marcar su hora, y recalcularla da el resultado correcto', async () => {
    await telemetry(SESSION_A, 3, '09:45', 450);
    await telemetry(SESSION_B, 0, '09:50', 20);
    await eventually(async () => {
      expect(
        await query(`select 1 from cell_hourly_pending where cell_id = '${CELL}'`),
      ).toHaveLength(1);
    });
    await app.get(HistoryAggregator).runOnce();
    // Nueva sesión: sus 20 cajas cuentan desde cero.
    expect((await hourRow(at('09:00')))?.boxes).toBe(370);
    // Recalcular sin cambios no altera nada.
    await pool.query(
      `insert into cell_hourly_pending values ('demo', '${CELL}', '${at('09:00')}', clock_timestamp())`,
    );
    await app.get(HistoryAggregator).runOnce();
    expect((await hourRow(at('09:00')))?.boxes).toBe(370);
  });

  it('con retención, borra el dato en bruto antiguo y conserva el último de la célula', async () => {
    const count = async () =>
      Number(
        (
          await query<{ n: string }>(
            `select count(*) as n from telemetry_samples where cell_id = '${CELL}'`,
          )
        )[0]?.n,
      );
    expect(await count()).toBe(5);
    const config = {
      get: (key: keyof AppConfig) => (key === 'HISTORY_RAW_RETENTION_DAYS' ? 30 : 0),
    } as unknown as ConfigService<AppConfig, true>;
    const logged: unknown[] = [];
    const logger = {
      info: () => undefined,
      warn: (...args: unknown[]) => logged.push(args),
      error: (...args: unknown[]) => logged.push(args),
    };
    const retention = new RetentionService(
      app.get<Database>(DATABASE),
      config,
      logger as unknown as PinoLogger,
    );
    const deleted = await retention.runOnce(new Date('2026-12-01T00:00:00Z'));
    expect(logged).toEqual([]);
    expect(deleted).toBe(4);
    expect(await count()).toBe(1);
    // Los agregados no se tocan.
    expect((await hourRow(at('09:00')))?.boxes).toBe(370);
  });
});
