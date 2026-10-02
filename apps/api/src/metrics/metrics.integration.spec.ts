import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { buildStateMessage, buildTelemetryMessage } from '@logicflows/contract/testing';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MqttIngestionService } from '../ingestion/mqtt-ingestion.service.ts';
import { createApp } from '../testing/app.ts';
import { startDatabase } from '../testing/database.ts';
import {
  API_PASSWORD,
  SIMULATOR_PASSWORD,
  eventually,
  startBroker,
  waitFor,
} from '../testing/broker.ts';
import type { TestBroker } from '../testing/broker.ts';

const METRICS_TOKEN = 'token-de-metricas-solo-para-pruebas-0123456789';
const topic = (kind: string) => `logicflows/v1/demo/cell-01/${kind}`;

describe('métricas de la API con el sistema real', () => {
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let broker: TestBroker;
  let app: INestApplication;
  let publisher: MqttClient;
  const http = () => request(app.getHttpServer() as Server);
  const scrape = () =>
    http().get('/metrics').set('Authorization', `Bearer ${METRICS_TOKEN}`).expect(200);

  beforeAll(async () => {
    broker = await startBroker();
    database = await startDatabase();
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.url,
      MQTT_API_PASSWORD: API_PASSWORD,
      METRICS_TOKEN,
    });
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
    await database.stop();
    await broker.container.stop();
    delete process.env['METRICS_TOKEN'];
  });

  it('exige el token de las métricas', async () => {
    const missing = await http().get('/metrics').expect(401);
    expect(missing.headers['www-authenticate']).toBe('Bearer');
    await http().get('/metrics').set('Authorization', 'Bearer otro-token').expect(401);
  });

  it('no está bajo el prefijo de la API REST ni en el documento OpenAPI', async () => {
    await http().get('/api/v1/metrics').expect(404);
    const response = await http().get('/docs/openapi.json').expect(200);
    expect(Object.keys((response.body as { paths: object }).paths)).not.toContain('/metrics');
  });

  it('informa de las dependencias disponibles', async () => {
    const response = await scrape();
    expect(response.headers['content-type']).toMatch(/^text\/plain;.*version=0\.0\.4/);
    expect(response.text).toMatch(/logicflows_dependency_up\{[^}]*dependency="mqtt"[^}]*\} 1/);
    expect(response.text).toMatch(/logicflows_dependency_up\{[^}]*dependency="database"[^}]*\} 1/);
    expect(response.text).toMatch(/logicflows_realtime_clients\{[^}]*\} 0/);
  });

  it('cuenta los mensajes recibidos y descartados y registra la última señal de la célula', async () => {
    const now = new Date().toISOString();
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    await publisher.publishAsync(
      topic('state'),
      JSON.stringify(buildStateMessage({ seq: 1, timestamp: minuteAgo })),
      { qos: 1 },
    );
    await publisher.publishAsync(topic('state'), 'esto no es JSON', { qos: 1 });
    await publisher.publishAsync(
      topic('telemetry'),
      JSON.stringify(buildTelemetryMessage({ seq: 1, timestamp: now })),
      { qos: 1 },
    );

    await eventually(async () => {
      const { text } = await scrape();
      expect(text).toMatch(/logicflows_mqtt_messages_received_total\{[^}]*kind="state"[^}]*\} 2/);
      expect(text).toMatch(
        /logicflows_mqtt_messages_discarded_total\{[^}]*kind="state",reason="INVALID_JSON"[^}]*\} 1/,
      );
      expect(text).toMatch(/logicflows_ingestion_latency_seconds_count\{[^}]*kind="telemetry"/);
      const lastMessage =
        /logicflows_cell_last_message_timestamp_seconds\{[^}]*cell_id="cell-01"[^}]*\} (\S+)/.exec(
          text,
        );
      expect(Number(lastMessage?.[1])).toBe(Date.parse(now) / 1_000);
    });
  });
});
