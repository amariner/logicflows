import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import type { AlarmAcknowledgement } from '@logicflows/contract';
import { buildStateMessage } from '@logicflows/contract/testing';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CellEventView } from '../history/events.ts';
import { MqttIngestionService } from '../ingestion/mqtt-ingestion.service.ts';
import { CellStateStore } from '../realtime/cell-state.store.ts';
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

const RAISED_AT = new Date(Date.now() - 60_000).toISOString();
const alarm = {
  code: 'ROB-001',
  severity: 'HIGH' as const,
  message: 'Colisión',
  raisedAt: RAISED_AT,
};
const PATH = '/api/v1/sites/demo/cells/cell-07/alarms/ROB-001/acknowledgements';

describe('reconocimiento de alarmas (ADR-0022)', () => {
  let broker: TestBroker;
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let publisher: MqttClient;
  let viewer: string;
  let operator: string;
  let otherOperator: string;
  const http = (token: string) =>
    request.agent(app.getHttpServer() as Server).set('Authorization', `Bearer ${token}`);
  const store = () =>
    app
      .get(CellStateStore)
      .snapshot()
      .find((cell) => cell.cellId === 'cell-07');
  const publishState = (seq: number, state: 'FAULT' | 'STOPPED', alarms: (typeof alarm)[]) =>
    publisher.publishAsync(
      'logicflows/v1/demo/cell-07/state',
      JSON.stringify(
        buildStateMessage({
          cellId: 'cell-07',
          seq,
          state,
          activeAlarms: alarms,
          timestamp: new Date().toISOString(),
        }),
      ),
      { qos: 1 },
    );

  beforeAll(async () => {
    [broker, database] = await Promise.all([startBroker(), startDatabase()]);
    const issuer = await testIssuer();
    viewer = await issuer.token({ subject: 'u-viewer', name: 'pantalla', roles: ['viewer'] });
    operator = await issuer.token({ subject: 'u-1', name: 'operaria', roles: ['operator'] });
    otherOperator = await issuer.token({ subject: 'u-2', name: 'otro', roles: ['admin'] });
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.url,
      MQTT_API_PASSWORD: API_PASSWORD,
    });
    await waitFor(() => app.get(MqttIngestionService).connected);
    publisher = await mqtt.connectAsync(broker.url, {
      protocolVersion: 5,
      username: 'simulator',
      password: SIMULATOR_PASSWORD,
    });
    await publishState(1, 'FAULT', [alarm]);
    await waitFor(() => store()?.state?.state === 'FAULT');
  }, 120_000);

  afterAll(async () => {
    await publisher.endAsync();
    await app.close();
    await Promise.all([broker.container.stop(), database.stop()]);
  });

  it('un viewer no puede reconocer', async () => {
    await http(viewer).post(PATH).send({ raisedAt: RAISED_AT }).expect(403);
  });

  it('no se reconoce una activación que no está activa ni una célula desconocida', async () => {
    await http(operator)
      .post(PATH)
      .send({ raisedAt: new Date(Date.parse(RAISED_AT) - 1000).toISOString() })
      .expect(409);
    await http(operator)
      .post('/api/v1/sites/demo/cells/cell-99/alarms/ROB-001/acknowledgements')
      .send({ raisedAt: RAISED_AT })
      .expect(404);
    await http(operator).post(PATH).send({ raisedAt: 'ayer' }).expect(400);
  });

  it('un operator la reconoce, y el segundo ve quién llegó antes', async () => {
    const first = await http(operator).post(PATH).send({ raisedAt: RAISED_AT }).expect(201);
    const acknowledgement = first.body as AlarmAcknowledgement;
    expect(acknowledgement).toMatchObject({
      code: 'ROB-001',
      raisedAt: RAISED_AT,
      acknowledgedBy: 'operaria',
    });
    const second = await http(otherOperator).post(PATH).send({ raisedAt: RAISED_AT }).expect(200);
    expect(second.body).toEqual(acknowledgement);

    // La célula lo lleva, para el visor en tiempo real y por REST.
    expect(store()?.acknowledgements).toEqual([acknowledgement]);
    const cell = await http(viewer).get('/api/v1/sites/demo/cells/cell-07').expect(200);
    expect((cell.body as { acknowledgements: unknown }).acknowledgements).toEqual([
      acknowledgement,
    ]);
  });

  it('queda en el registro de eventos con quién y cuándo', async () => {
    const response = await http(viewer).get('/api/v1/sites/demo/cells/cell-07/events').expect(200);
    const events = (response.body as { events: CellEventView[] }).events;
    expect(events.find((event) => event.kind === 'acknowledgement')).toMatchObject({
      acknowledgement: { code: 'ROB-001', raisedAt: RAISED_AT, acknowledgedBy: 'operaria' },
    });
  });

  it('la alarma sigue activa: el reconocimiento no cambia el estado de la célula', () => {
    expect(store()?.state?.state).toBe('FAULT');
    expect(store()?.state?.activeAlarms).toHaveLength(1);
  });

  it('cuando la célula la resuelve, el reconocimiento deja de estar en la célula', async () => {
    await publishState(2, 'STOPPED', []);
    await eventually(() => {
      expect(store()?.state?.state).toBe('STOPPED');
      expect(store()?.acknowledgements).toBeUndefined();
      return Promise.resolve();
    });
    await http(operator).post(PATH).send({ raisedAt: RAISED_AT }).expect(409);
  });
});
