import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import type { Alarm } from '@logicflows/contract';
import { buildStateMessage, testUuid } from '@logicflows/contract/testing';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POOL } from '../database/database.module.ts';
import { MqttIngestionService } from '../ingestion/mqtt-ingestion.service.ts';
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
import type { PushNotification } from './alarm-activations.ts';
import { FCM_CLIENT } from './fcm-client.ts';
import type { FcmClient, SendResult } from './fcm-client.ts';
import { PushRepository } from './push.repository.ts';

const SESSION = testUuid(20);
/** Hace `seconds` segundos: los avisos solo salen para alarmas recientes. */
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

const collision: Alarm = {
  code: 'ROB-001',
  severity: 'HIGH',
  message: 'Colisión del robot detectada',
  raisedAt: ago(120),
};
const emergency: Alarm = {
  code: 'SAF-001',
  severity: 'CRITICAL',
  message: 'Parada de emergencia activada',
  raisedAt: ago(60),
};

/** FCM falso: guarda cada envío y responde lo que indique la prueba por token. */
class FakeFcm implements FcmClient {
  readonly enabled = true;
  readonly sent: { token: string; notification: PushNotification }[] = [];
  readonly results = new Map<string, SendResult>();

  send = vi.fn((token: string, notification: PushNotification): Promise<SendResult> => {
    this.sent.push({ token, notification });
    return Promise.resolve(this.results.get(token) ?? 'sent');
  });
}

describe('avisos de alarmas en el móvil (ADR-0015)', () => {
  let broker: TestBroker;
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let publisher: MqttClient;
  let pool: Pool;
  const fcm = new FakeFcm();
  let seq = 0;

  const as = async (subject: string) => {
    const token = await (await testIssuer()).token({ subject });
    return request.agent(app.getHttpServer() as Server).set('Authorization', `Bearer ${token}`);
  };
  const devices = async () =>
    (
      await pool.query<{ token: string; user_id: string }>(
        'select token, user_id from push_devices order by 1',
      )
    ).rows;
  const publishState = (overrides: Parameters<typeof buildStateMessage>[0]) =>
    publisher.publishAsync(
      'logicflows/v1/demo/cell-01/state',
      JSON.stringify(
        buildStateMessage({
          sessionId: SESSION,
          seq: seq++,
          messageId: testUuid(3000 + seq),
          ...overrides,
        }),
      ),
      { qos: 1 },
    );

  beforeAll(async () => {
    [broker, database] = await Promise.all([startBroker(), startDatabase()]);
    app = await createApp(
      {
        DATABASE_URL: database.getConnectionUri(),
        MQTT_URL: broker.url,
        MQTT_API_PASSWORD: API_PASSWORD,
      },
      (builder) => builder.overrideProvider(FCM_CLIENT).useValue(fcm),
    );
    pool = app.get<Pool>(POOL);
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

  beforeEach(() => {
    fcm.sent.length = 0;
  });

  it('registra el dispositivo de cada usuario y valida el token', async () => {
    await (
      await as('operario-1')
    )
      .post('/api/v1/push/devices')
      .send({ token: 'movil-a' })
      .expect(204);
    await (
      await as('operario-2')
    )
      .post('/api/v1/push/devices')
      .send({ token: 'movil-b' })
      .expect(204);
    await (await as('operario-1')).post('/api/v1/push/devices').send({ token: '' }).expect(400);
    await request(app.getHttpServer() as Server)
      .post('/api/v1/push/devices')
      .send({ token: 'sin-sesion' })
      .expect(401);
    expect(await devices()).toEqual([
      { token: 'movil-a', user_id: 'operario-1' },
      { token: 'movil-b', user_id: 'operario-2' },
    ]);
  });

  it('avisa una sola vez por activación, a todos los dispositivos', async () => {
    await publishState({
      state: 'FAULT',
      event: 'fault',
      previousState: 'RUNNING',
      activeAlarms: [collision],
    });
    // La misma alarma sigue activa en el mensaje siguiente: no se repite el aviso.
    await publishState({
      state: 'FAULT',
      event: null,
      previousState: 'FAULT',
      activeAlarms: [collision],
    });
    await eventually(() => {
      expect(fcm.sent.map((s) => s.token).sort()).toEqual(['movil-a', 'movil-b']);
      return Promise.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(fcm.sent).toHaveLength(2);
    expect(fcm.sent[0]?.notification).toEqual({
      title: 'Alarma alta en LogicFlows',
      body: 'demo / cell-01',
      data: { siteId: 'demo', cellId: 'cell-01' },
      collapseKey: 'demo/cell-01',
    });
  });

  it('nunca envía el texto de la alarma a FCM', async () => {
    await publishState({
      state: 'EMERGENCY_STOP',
      event: 'emergencyStop',
      previousState: 'FAULT',
      activeAlarms: [collision, emergency],
    });
    await eventually(() => {
      expect(fcm.sent).toHaveLength(2);
      return Promise.resolve();
    });
    expect(fcm.sent[0]?.notification.title).toBe('Alarma crítica en LogicFlows');
    expect(JSON.stringify(fcm.sent)).not.toContain('Parada de emergencia activada');
  });

  it('una activación ya avisada no vuelve a avisar, también tras reiniciar la API', async () => {
    const repository = app.get(PushRepository);
    const activation = {
      siteId: 'demo',
      cellId: 'cell-01',
      code: 'ROB-001',
      raisedAt: collision.raisedAt,
      severity: 'HIGH' as const,
    };
    expect(await repository.markNotified(activation, new Date())).toBe(false);
  });

  it('olvida los dispositivos que FCM ya no reconoce', async () => {
    fcm.results.set('movil-b', 'unregistered');
    await publishState({
      state: 'FAULT',
      event: 'fault',
      previousState: 'STOPPED',
      activeAlarms: [{ ...collision, raisedAt: ago(30) }],
    });
    await eventually(async () => {
      expect((await devices()).map((d) => d.token)).toEqual(['movil-a']);
    });
  });

  it('no avisa de alarmas antiguas, como las de un histórico cargado', async () => {
    await publishState({
      state: 'FAULT',
      event: null,
      previousState: 'FAULT',
      activeAlarms: [{ ...collision, code: 'ROB-002', raisedAt: ago(3 * 24 * 3600) }],
    });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(fcm.sent).toHaveLength(0);
  });

  it('cada usuario solo puede dar de baja sus dispositivos', async () => {
    await (
      await as('operario-2')
    )
      .delete('/api/v1/push/devices')
      .send({ token: 'movil-a' })
      .expect(204);
    expect((await devices()).map((d) => d.token)).toEqual(['movil-a']);
    await (
      await as('operario-1')
    )
      .delete('/api/v1/push/devices')
      .send({ token: 'movil-a' })
      .expect(204);
    expect(await devices()).toEqual([]);
  });
});
