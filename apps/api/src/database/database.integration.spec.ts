import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../testing/app.ts';
import { startDatabase } from '../testing/database.ts';
import { eventually, freePort } from '../testing/broker.ts';
import { POOL } from './database.module.ts';

describe('conexiones con PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let pool: Pool;
  let databaseStopped = false;
  const http = () => request(app.getHttpServer() as Server);

  beforeAll(async () => {
    const port = await freePort();
    database = await startDatabase();
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: `mqtt://127.0.0.1:${String(port)}`,
      MQTT_API_PASSWORD: 'x',
    });
    pool = app.get<Pool>(POOL);
  });

  afterAll(async () => {
    await app.close();
    if (!databaseStopped) {
      await database.stop();
    }
  });

  it('sigue funcionando si PostgreSQL cierra una conexión inactiva', async () => {
    // Una conexión queda inactiva en el pool, como entre dos peticiones.
    const idle = await pool.connect();
    const {
      rows: [row],
    } = await idle.query<{ pid: number }>('select pg_backend_pid() as pid');
    idle.release();

    // El servidor la cierra, como en un reinicio o un mantenimiento.
    const admin = new Client({ connectionString: database.getConnectionUri() });
    await admin.connect();
    await admin.query('select pg_terminate_backend($1)', [row?.pid]);
    await admin.end();

    await eventually(async () => {
      const result = await pool.query<{ ok: number }>('select 1 as ok');
      expect(result.rows[0]?.ok).toBe(1);
    });
    const response = await http().get('/health/ready');
    expect(response.body).toMatchObject({ details: { database: { status: 'up' } } });
  });

  it('informa de que la base de datos no está disponible sin detenerse', async () => {
    await database.stop();
    databaseStopped = true;

    const response = await http().get('/health/ready').expect(503);
    expect(response.body).toMatchObject({ details: { database: { status: 'down' } } });
    await http().get('/health/live').expect(200);
  });
});
