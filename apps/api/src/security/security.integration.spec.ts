import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { REALTIME_PATH } from '@logicflows/contract';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { createApp } from '../testing/app.ts';
import { testIssuer } from '../testing/auth.ts';
import { freePort } from '../testing/broker.ts';
import { startDatabase } from '../testing/database.ts';

describe('endurecimiento de la API (LF-52)', () => {
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let token: string;
  const http = () => request(app.getHttpServer() as Server);
  const LIMIT = 5;

  beforeAll(async () => {
    token = await (await testIssuer()).token();
    database = await startDatabase();
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: `mqtt://127.0.0.1:${String(await freePort())}`,
      MQTT_API_PASSWORD: 'x',
      RATE_LIMIT_PER_MINUTE: String(LIMIT),
    });
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
    await database.stop();
  });

  it('las respuestas de la API llevan cabeceras de seguridad y no cargan nada', async () => {
    const response = await http().get('/health/live').expect(200);
    expect(response.headers).toMatchObject({
      'content-security-policy': "default-src 'none';frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'strict-transport-security': expect.stringContaining('max-age=') as unknown,
      'referrer-policy': 'no-referrer',
    });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('la documentación OpenAPI conserva una política que le permite funcionar', async () => {
    const response = await http().get('/docs/').expect(200);
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('rechaza un cuerpo de más de 16 KB con 413', async () => {
    const response = await http()
      .post('/api/v1/realtime/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ relleno: 'x'.repeat(20_000) })
      .expect(413);
    expect(response.body).toMatchObject({ status: 413, title: 'Petición demasiado grande' });
  });

  it('cierra el canal de tiempo real si recibe un mensaje de más de 1 KB', async () => {
    const { ticket } = (
      await http()
        .post('/api/v1/realtime/tickets')
        .set('Authorization', `Bearer ${token}`)
        .expect(201)
    ).body as { ticket: string };
    const port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}${REALTIME_PATH}?ticket=${ticket}`);
    await new Promise((resolve) => socket.once('message', resolve));
    const closed = new Promise<number>((resolve) => socket.once('close', resolve));
    socket.send('x'.repeat(2_048));
    expect(await closed).toBe(1009);
  });

  it('limita las peticiones por cliente con 429 y Retry-After', async () => {
    let response = await http().get('/api/v1/cells').set('Authorization', `Bearer ${token}`);
    for (let attempt = 0; attempt < LIMIT + 2 && response.status !== 429; attempt++) {
      response = await http().get('/api/v1/cells').set('Authorization', `Bearer ${token}`);
    }
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body).toMatchObject({ status: 429, title: 'Demasiadas peticiones' });
  });

  it('las comprobaciones de salud no cuentan para el límite', async () => {
    for (let attempt = 0; attempt < LIMIT + 2; attempt++) {
      await http().get('/health/live').expect(200);
    }
  });
});
