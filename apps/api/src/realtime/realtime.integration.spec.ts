import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { REALTIME_PATH } from '@logicflows/contract';
import type { RealtimeMessage } from '@logicflows/contract';
import { buildStateMessage, buildTelemetryMessage } from '@logicflows/contract/testing';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { MqttIngestionService } from '../ingestion/mqtt-ingestion.service.ts';
import { createApp } from '../testing/app.ts';
import { RealtimeTickets } from './realtime-tickets.ts';
import { testIssuer } from '../testing/auth.ts';
import { startDatabase } from '../testing/database.ts';
import { API_PASSWORD, SIMULATOR_PASSWORD, startBroker, waitFor } from '../testing/broker.ts';
import type { TestBroker } from '../testing/broker.ts';

interface RealtimeClient {
  readonly socket: WebSocket;
  readonly received: RealtimeMessage[];
}

describe('canal de tiempo real con un broker real', () => {
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let broker: TestBroker;
  let app: INestApplication;
  let publisher: MqttClient;
  let url: string;
  let apiUrl: string;
  const clients: RealtimeClient[] = [];

  // Un cliente está conectado cuando recibe la instantánea, no cuando se abre
  // el WebSocket: la API valida el tique después de abrirlo y solo garantiza
  // los cambios posteriores a la instantánea.
  const connect = async (): Promise<RealtimeClient> => {
    const response = await fetch(`${apiUrl}/api/v1/realtime/tickets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await (await testIssuer()).token()}` },
    });
    const { ticket } = (await response.json()) as { ticket: string };
    const socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`);
    const client: RealtimeClient = { socket, received: [] };
    socket.on('message', (data: Buffer) => {
      client.received.push(JSON.parse(data.toString('utf8')) as RealtimeMessage);
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => {
        resolve();
      });
      socket.once('error', reject);
    });
    clients.push(client);
    await waitFor(() => client.received.some((message) => message.type === 'snapshot'));
    return client;
  };

  const publish = (kind: string, message: object) =>
    publisher.publishAsync(`logicflows/v1/demo/cell-01/${kind}`, JSON.stringify(message), {
      qos: 1,
    });

  beforeAll(async () => {
    broker = await startBroker();
    database = await startDatabase();
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.url,
      MQTT_API_PASSWORD: API_PASSWORD,
    });
    await app.listen(0);
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    url = `ws://127.0.0.1:${String(port)}${REALTIME_PATH}`;
    apiUrl = `http://127.0.0.1:${String(port)}`;
    const ingestion = app.get(MqttIngestionService);
    await waitFor(() => ingestion.connected);
    publisher = await mqtt.connectAsync(broker.url, {
      protocolVersion: 5,
      username: 'simulator',
      password: SIMULATOR_PASSWORD,
    });
  });

  afterAll(async () => {
    for (const client of clients) {
      client.socket.close();
    }
    await publisher.endAsync();
    await app.close();
    await database.stop();
    await broker.container.stop();
  });

  it('envía una instantánea al conectar', async () => {
    const client = await connect();
    await waitFor(() => client.received.length === 1);
    expect(client.received[0]).toEqual({ type: 'snapshot', cells: [] });
  });

  it('envía cada cambio a todos los clientes conectados', async () => {
    const first = await connect();
    const second = await connect();

    await publish('state', buildStateMessage({ seq: 1, state: 'RUNNING' }));

    for (const client of [first, second]) {
      await waitFor(() => client.received.some((m) => m.type === 'cell'));
      expect(client.received.at(-1)).toMatchObject({
        type: 'cell',
        cell: { siteId: 'demo', cellId: 'cell-01', state: { state: 'RUNNING' } },
      });
    }
  });

  it('un cliente que se conecta después recibe la información ya conocida', async () => {
    await publish('telemetry', buildTelemetryMessage({ seq: 1, boxesTotal: 12 }));
    const late = await connect();
    await waitFor(() => late.received.length > 0);
    const [snapshot] = late.received;
    expect(snapshot).toMatchObject({
      type: 'snapshot',
      cells: [{ cellId: 'cell-01', state: { state: 'RUNNING' }, telemetry: { boxesTotal: 12 } }],
    });
  });

  it('no envía los mensajes descartados por la ingesta', async () => {
    const client = await connect();
    await waitFor(() => client.received.length === 1);
    await publish('state', buildStateMessage({ seq: 1, state: 'FAULT', event: 'fault' }));
    await publish('state', buildStateMessage({ seq: 2, state: 'PAUSED', event: 'pause' }));
    await waitFor(() => client.received.length === 2);
    expect(client.received.at(-1)).toMatchObject({ cell: { state: { state: 'PAUSED', seq: 2 } } });
  });

  it('un cambio publicado mientras se valida el tique llega en la instantánea', async () => {
    const watcher = await connect();
    const changes = watcher.received.length;
    const tickets = app.get(RealtimeTickets);
    const redeem = tickets.redeem.bind(tickets);
    let release = (): void => undefined;
    const validating = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(tickets, 'redeem').mockImplementation(async (...args) => {
      await validating;
      return redeem(...args);
    });
    try {
      const pending = connect();
      await waitFor(() => spy.mock.calls.length === 1);
      await publish(
        'state',
        buildStateMessage({ seq: 3, state: 'RUNNING', previousState: 'PAUSED', event: 'resume' }),
      );
      await waitFor(() => watcher.received.length > changes);
      release();
      const late = await pending;

      expect(late.received[0]).toMatchObject({
        type: 'snapshot',
        cells: [{ cellId: 'cell-01', state: { state: 'RUNNING', seq: 3 } }],
      });
    } finally {
      spy.mockRestore();
    }
  });
});
