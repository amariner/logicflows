import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../testing/app.ts';
import { startDatabase } from '../testing/database.ts';
import { API_PASSWORD, eventually, startBroker } from '../testing/broker.ts';
import type { TestBroker } from '../testing/broker.ts';

describe('API HTTP con el broker disponible', () => {
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let broker: TestBroker;
  let app: INestApplication;
  const http = () => request(app.getHttpServer() as Server);

  beforeAll(async () => {
    broker = await startBroker();
    database = await startDatabase();
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.url,
      MQTT_API_PASSWORD: API_PASSWORD,
    });
  });

  afterAll(async () => {
    await app.close();
    await database.stop();
    await broker.container.stop();
  });

  it('/health/live responde que la API está viva', async () => {
    const response = await http().get('/health/live').expect(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('/health/ready informa de la conexión con el broker', async () => {
    await eventually(async () => {
      const response = await http().get('/health/ready').expect(200);
      expect(response.body).toMatchObject({ status: 'ok', details: { mqtt: { status: 'up' } } });
    });
  });

  it('publica el documento OpenAPI con los endpoints de salud', async () => {
    const response = await http().get('/docs/openapi.json').expect(200);
    const document = response.body as { info: { title: string }; paths: Record<string, unknown> };
    expect(document.info.title).toBe('LogicFlows API');
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/health/live', '/health/ready']),
    );
  });

  it('responde 404 a una ruta que no existe', async () => {
    await http().get('/no-existe').expect(404);
  });
});
