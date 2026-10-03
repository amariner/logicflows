import type { Server } from 'node:http';

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
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';

import type { AppConfig } from '../config/config.ts';
import { DATABASE, POOL } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import { MqttIngestionService } from '../ingestion/mqtt-ingestion.service.ts';
import { TelemetryRepository } from '../persistence/telemetry.repository.ts';
import { createApp } from '../testing/app.ts';
import { testIssuer } from '../testing/auth.ts';
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
import { HistoryService } from './history.service.ts';
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

describe('histórico agregado por hora (LF-79, LF-80)', () => {
  let broker: TestBroker;
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let publisher: MqttClient;
  let pool: Pool;
  let id = 5000;
  let token: string;

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
    token = await (await testIssuer()).token();
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

  it('la producción de un periodo coincide con la calculada en bruto', async () => {
    const service = app.get(HistoryService);
    const raw = app.get(TelemetryRepository);
    for (const [from, to] of [
      ['08:00', '11:00'],
      ['08:30', '09:40'],
      ['09:15', '09:35'],
    ] as const) {
      const range = [CELL, new Date(at(from)), new Date(at(to))] as const;
      expect(await service.production('demo', ...range)).toEqual(
        await raw.production('demo', ...range),
      );
    }
  });

  it('GET …/history devuelve los indicadores del periodo y de cada hora', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get(`/api/v1/sites/demo/cells/${CELL}/history`)
      .set('Authorization', `Bearer ${token}`)
      .query({ from: at('08:00'), to: at('11:00') })
      .expect(200);
    const body = response.body as {
      summary: Record<string, unknown>;
      periods: { from: string; boxes: number; seconds: { total: number } }[];
    };
    expect(body).toMatchObject({
      siteId: 'demo',
      cellId: CELL,
      resolution: 'hour',
      timeZone: 'UTC',
      nominalBoxesPerHour: 900,
    });
    // 08:00: sin datos hasta las 08:55 y en producción después.
    expect(body.summary).toEqual({
      from: at('08:00'),
      to: at('11:00'),
      boxes: 470,
      pallets: 11,
      seconds: {
        total: 3 * 3600,
        noData: 55 * 60,
        outOfProduction: 30 * 60 + 3600,
        planned: 25 * 60 + 10 * 60,
        running: 25 * 60,
        stopped: 10 * 60,
      },
      availability: 25 / 35,
      performance: 470 / ((25 / 60) * 900),
      stops: [{ cause: 'FAULT', alarmCode: 'ROB-001', seconds: 600, count: 1 }],
      alarms: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
    });
    expect(body.periods.map((period) => [period.from, period.boxes])).toEqual([
      [at('08:00'), 100],
      [at('09:00'), 370],
      [at('10:00'), 0],
    ]);
  });

  it('con 90 días de agregados, el histórico de 30 días responde en menos de 300 ms', async () => {
    await pool.query(`
      insert into cell_hourly
      select 'demo', 'cell-perf', hour, 800, 20,
             '{"RUNNING": 3000, "FAULT": 300, "STOPPED": 300}',
             '{"FAULT:ROB-001": {"seconds": 300, "count": 1}}',
             '{"HIGH": 1}', hour + interval '1 hour'
      from generate_series('2026-06-01T00:00:00Z'::timestamptz, '2026-08-29T23:00:00Z', '1 hour') as hour
    `);
    const service = app.get(HistoryService);
    const query = {
      from: new Date('2026-07-30T00:00:00Z'),
      to: new Date('2026-08-29T00:00:00Z'),
      timeZone: 'Europe/Madrid',
    };
    for (const resolution of ['hour', 'day'] as const) {
      const started = performance.now();
      const history = await service.history('demo', 'cell-perf', { ...query, resolution });
      expect(performance.now() - started).toBeLessThan(300);
      expect(history.summary.boxes).toBe(30 * 24 * 800);
      expect(history.periods).toHaveLength(resolution === 'hour' ? 30 * 24 : 31);
    }
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
    // Los agregados no se tocan, y la producción de las horas completas sale de ellos.
    expect((await hourRow(at('09:00')))?.boxes).toBe(370);
    expect(
      await app
        .get(HistoryService)
        .production('demo', CELL, new Date(at('08:00')), new Date(at('11:00'))),
    ).toEqual({ boxes: 470, pallets: 11 });
  });
});
