import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { REALTIME_PATH, REALTIME_UNAUTHORIZED_CLOSE_CODE } from '@logicflows/contract';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { createApp } from '../testing/app.ts';
import { testIssuer } from '../testing/auth.ts';
import type { TestIssuer } from '../testing/auth.ts';
import { freePort } from '../testing/broker.ts';
import { startDatabase } from '../testing/database.ts';

interface Connection {
  readonly messages: unknown[];
  readonly closed: Promise<number>;
}

describe('autenticación y autorización (ADR-0009)', () => {
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let issuer: TestIssuer;
  let base: string;
  const http = () => request(app.getHttpServer() as Server);

  const ticket = async (token: string) => {
    const response = await http()
      .post('/api/v1/realtime/tickets')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    return (response.body as { ticket: string }).ticket;
  };

  const connect = (query: string): Promise<Connection> =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(`${base.replace('http', 'ws')}${REALTIME_PATH}${query}`);
      const messages: unknown[] = [];
      socket.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString('utf8'))));
      const closed = new Promise<number>((done) => socket.once('close', done));
      socket.once('open', () => {
        resolve({ messages, closed });
      });
      socket.once('error', reject);
    });

  beforeAll(async () => {
    issuer = await testIssuer();
    database = await startDatabase();
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: `mqtt://127.0.0.1:${String(await freePort())}`,
      MQTT_API_PASSWORD: 'x',
    });
    await app.listen(0);
    base = `http://127.0.0.1:${String(((app.getHttpServer() as Server).address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await app.close();
    await database.stop();
  });

  describe('API REST', () => {
    it('sin token responde 401 con Problem Details e indica el esquema', async () => {
      const response = await http().get('/api/v1/cells').expect(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 401, title: 'No autenticado' });
    });

    it.each([
      ['firmado por otra clave', () => issuer.forgedToken()],
      ['caducado', () => issuer.token({ expiresInSeconds: -60 })],
      ['para otra audiencia', () => issuer.token({ audience: 'otra-api' })],
      ['mal formado', () => Promise.resolve('no-es-un-jwt')],
    ])('rechaza un token %s', async (_case, token) => {
      const response = await http()
        .get('/api/v1/cells')
        .set('Authorization', `Bearer ${await token()}`)
        .expect(401);
      expect(response.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    });

    it('un usuario sin rol recibe 403', async () => {
      const token = await issuer.token({ roles: [] });
      const response = await http()
        .get('/api/v1/cells')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(response.body).toMatchObject({ status: 403, title: 'Sin permiso' });
    });

    it.each([['viewer'], ['admin']] as const)('el rol %s puede consultar', async (role) => {
      const token = await issuer.token({ roles: [role] });
      await http().get('/api/v1/cells').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('las comprobaciones de salud no necesitan token', async () => {
      await http().get('/health/live').expect(200);
    });

    it('OpenAPI documenta el esquema de seguridad', async () => {
      const response = await http().get('/docs/openapi.json').expect(200);
      expect(response.body).toMatchObject({
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
      });
    });
  });

  describe('canal de tiempo real', () => {
    it('pedir un tique exige un token', async () => {
      await http().post('/api/v1/realtime/tickets').expect(401);
    });

    it('con un tique válido recibe la instantánea', async () => {
      const connection = await connect(`?ticket=${await ticket(await issuer.token())}`);
      await expect.poll(() => connection.messages).toEqual([{ type: 'snapshot', cells: [] }]);
    });

    it.each([
      ['sin tique', () => Promise.resolve('')],
      ['con un tique inventado', () => Promise.resolve('?ticket=inventado')],
    ])('cierra la conexión %s con el código 4401', async (_case, query) => {
      const connection = await connect(await query());
      expect(await connection.closed).toBe(REALTIME_UNAUTHORIZED_CLOSE_CODE);
      expect(connection.messages).toEqual([]);
    });

    it('un tique no sirve dos veces', async () => {
      const used = await ticket(await issuer.token());
      await connect(`?ticket=${used}`);
      const second = await connect(`?ticket=${used}`);
      expect(await second.closed).toBe(REALTIME_UNAUTHORIZED_CLOSE_CODE);
    });

    it('cierra la conexión cuando caduca el token con el que se pidió el tique', async () => {
      const connection = await connect(
        `?ticket=${await ticket(await issuer.token({ expiresInSeconds: 2 }))}`,
      );
      await expect.poll(() => connection.messages.length).toBe(1);
      expect(await connection.closed).toBe(REALTIME_UNAUTHORIZED_CLOSE_CODE);
    });
  });

  it('si no puede obtener las claves del emisor responde 503, no 401', async () => {
    const unreachable = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: `mqtt://127.0.0.1:${String(await freePort())}`,
      MQTT_API_PASSWORD: 'x',
      MQTT_CLIENT_ID: 'logicflows-api-sin-emisor',
      AUTH_ISSUER: `http://127.0.0.1:${String(await freePort())}`,
    });
    const response = await request(unreachable.getHttpServer() as Server)
      .get('/api/v1/cells')
      .set('Authorization', `Bearer ${await issuer.token()}`)
      .expect(503);
    expect(response.body).toMatchObject({ status: 503, title: 'Servicio no disponible' });
    await unreachable.close();
  });
});
