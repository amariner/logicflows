import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../testing/app.ts';
import { startDatabase } from '../testing/database.ts';
import { freePort } from '../testing/broker.ts';

describe('API HTTP sin broker', () => {
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  const http = () => request(app.getHttpServer() as Server);

  beforeAll(async () => {
    // Un puerto libre en el que nadie escucha: el broker no está disponible.
    const port = await freePort();
    database = await startDatabase();
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: `mqtt://127.0.0.1:${String(port)}`,
      MQTT_API_PASSWORD: 'x',
    });
  });

  afterAll(async () => {
    await app.close();
    await database.stop();
  });

  it('arranca igualmente y sigue viva', async () => {
    await http().get('/health/live').expect(200);
  });

  it('no está disponible e indica el motivo', async () => {
    const response = await http().get('/health/ready').expect(503);
    expect(response.body).toMatchObject({
      status: 'error',
      details: { mqtt: { status: 'down', message: 'Sin conexión con el broker' } },
    });
  });
});
