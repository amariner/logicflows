import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { decodeMessage } from '@logicflows/contract';
import type { DecodedMessage } from '@logicflows/contract';
import { buildStateMessage, buildTelemetryMessage, testUuid } from '@logicflows/contract/testing';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POOL } from '../database/database.module.ts';
import { HistoryAggregator } from '../history/history-aggregator.ts';
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

const decoded = (kind: string, message: object): DecodedMessage => {
  const result = decodeMessage(`logicflows/v1/demo/cell-01/${kind}`, JSON.stringify(message));
  if (!result.ok) {
    throw new Error(result.detail);
  }
  return result;
};

describe('API REST de células', () => {
  let broker: TestBroker;
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let publisher: MqttClient;
  let token: string;
  const http = () =>
    request.agent(app.getHttpServer() as Server).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    [broker, database] = await Promise.all([startBroker(), startDatabase()]);
    token = await (await testIssuer()).token();
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.url,
      MQTT_API_PASSWORD: API_PASSWORD,
      // La agregación se lanza a mano: el temporizador no interviene.
      HISTORY_AGGREGATION_INTERVAL_MS: '3600000',
    });
    await waitFor(() => app.get(MqttIngestionService).connected);
    publisher = await mqtt.connectAsync(broker.url, {
      protocolVersion: 5,
      username: 'simulator',
      password: SIMULATOR_PASSWORD,
    });
    // Producción de 1 caja a las 08:00 y 7 más a las 08:30 en una misma sesión.
    // Se guarda directamente, sin pasar por la ingesta, así que no marca su
    // hora como pendiente: la marca el mensaje de estado, que se publica
    // después para que la agregación ya vea toda la telemetría (LF-113).
    const repository = app.get(TelemetryRepository);
    for (const [seq, [boxes, minute]] of [
      [1, 0],
      [2, 0],
      [9, 30],
    ].entries()) {
      await repository.save(
        decoded(
          'telemetry',
          buildTelemetryMessage({
            seq,
            boxesTotal: boxes,
            palletsTotal: 0,
            messageId: testUuid(2000 + seq),
            timestamp: `2026-10-05T08:${String(minute).padStart(2, '0')}:0${String(seq)}.000Z`,
          }),
        ),
        new Date().toISOString(),
      );
    }
    await publisher.publishAsync(
      'logicflows/v1/demo/cell-01/state',
      JSON.stringify(buildStateMessage({ seq: 1, state: 'RUNNING' })),
      { qos: 1 },
    );
    // Las horas completas salen de los agregados (ADR-0016): se espera a que
    // la hora del estado esté marcada y agregada, sin depender del temporizador.
    const pool = app.get<Pool>(POOL);
    await eventually(async () => {
      await app.get(HistoryAggregator).runOnce();
      const [hour] = (
        await pool.query<{ boxes: number }>(
          `select boxes from cell_hourly where cell_id = 'cell-01' and hour = '2026-10-05T08:00:00Z'`,
        )
      ).rows;
      expect(hour?.boxes).toBe(9);
    });
  });

  afterAll(async () => {
    await publisher.endAsync();
    await app.close();
    await Promise.all([broker.container.stop(), database.stop()]);
  });

  it('GET /api/v1/cells devuelve el estado actual de todas las células', async () => {
    await eventually(async () => {
      const response = await http().get('/api/v1/cells').expect(200);
      expect(response.body).toMatchObject([
        { siteId: 'demo', cellId: 'cell-01', state: { state: 'RUNNING' } },
      ]);
    });
  });

  it('GET /api/v1/sites/demo/cells/cell-01 devuelve una célula', async () => {
    const response = await http().get('/api/v1/sites/demo/cells/cell-01').expect(200);
    expect(response.body).toMatchObject({ cellId: 'cell-01', state: { state: 'RUNNING' } });
  });

  it('responde 404 con Problem Details para una célula desconocida', async () => {
    const response = await http()
      .get('/api/v1/sites/demo/cells/cell-99')
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Recurso no encontrado',
      status: 404,
      detail: 'No hay datos de la célula demo/cell-99',
      instance: '/api/v1/sites/demo/cells/cell-99',
    });
  });

  it.each([
    [
      'una célula con un formato no válido',
      '/api/v1/sites/demo/cells/Cell%2001/production',
      'cellId',
    ],
    ['una fecha no válida', '/api/v1/sites/demo/cells/cell-01/production?from=ayer', 'from'],
  ])('responde 400 con los campos no válidos: %s', async (_case, path, field) => {
    const response = await http()
      .get(path)
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(response.body).toMatchObject({ status: 400, title: 'Petición no válida' });
    expect((response.body as { errors: { field: string }[] }).errors.map((e) => e.field)).toEqual([
      field,
    ]);
  });

  it('calcula la producción de una célula en un periodo', async () => {
    const response = await http()
      .get('/api/v1/sites/demo/cells/cell-01/production')
      .query({ from: '2026-10-05T08:00:00Z', to: '2026-10-05T09:00:00Z' })
      .expect(200);
    expect(response.body).toEqual({
      siteId: 'demo',
      cellId: 'cell-01',
      from: '2026-10-05T08:00:00.000Z',
      to: '2026-10-05T09:00:00.000Z',
      boxes: 9,
      pallets: 0,
    });
    const halfHour = await http()
      .get('/api/v1/sites/demo/cells/cell-01/production')
      .query({ from: '2026-10-05T08:15:00Z', to: '2026-10-05T09:00:00Z' })
      .expect(200);
    expect((halfHour.body as { boxes: number }).boxes).toBe(7);
  });

  it('rechaza un rango de producción no válido', async () => {
    const response = await http()
      .get('/api/v1/sites/demo/cells/cell-01/production')
      .query({ from: '2026-10-05T10:00:00Z', to: '2026-10-05T09:00:00Z' })
      .expect(400);
    expect(response.body).toMatchObject({
      errors: [{ field: 'from', message: 'from debe ser anterior a to' }],
    });
  });

  it('solo admite peticiones del navegador desde los orígenes configurados', async () => {
    const allowed = await http().get('/api/v1/cells').set('Origin', 'http://localhost:4200');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    const other = await http().get('/api/v1/cells').set('Origin', 'https://otro.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('documenta los endpoints en OpenAPI con los esquemas del contrato', async () => {
    const response = await http().get('/docs/openapi.json').expect(200);
    const document = response.body as {
      paths: Record<string, { get: { responses: Record<string, unknown> } }>;
    };
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/cells',
        '/api/v1/sites/{siteId}/cells/{cellId}',
        '/api/v1/sites/{siteId}/cells/{cellId}/production',
        '/api/v1/sites/{siteId}/cells/{cellId}/history',
      ]),
    );
    expect(JSON.stringify(document.paths['/api/v1/cells'])).toContain('EMERGENCY_STOP');
  });
});
