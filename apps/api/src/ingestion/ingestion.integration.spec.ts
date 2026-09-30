import type { INestApplication } from '@nestjs/common';
import { buildStateMessage, buildTelemetryMessage, testUuid } from '@logicflows/contract/testing';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../testing/app.ts';
import { API_PASSWORD, SIMULATOR_PASSWORD, startBroker, waitFor } from '../testing/broker.ts';
import type { TestBroker } from '../testing/broker.ts';
import { MqttIngestionService } from './mqtt-ingestion.service.ts';
import { TelemetryStream } from './telemetry-stream.ts';
import type { IngestedMessage } from './telemetry-stream.ts';

const topic = (kind: string, cellId = 'cell-01') => `logicflows/v1/demo/${cellId}/${kind}`;

describe('ingesta de telemetría con un broker real', () => {
  let broker: TestBroker;
  let app: INestApplication;
  let publisher: MqttClient;
  const received: IngestedMessage[] = [];

  const publish = (kind: string, message: unknown, cellId?: string) =>
    publisher.publishAsync(
      topic(kind, cellId),
      typeof message === 'string' ? message : JSON.stringify(message),
      { qos: 1 },
    );
  const receivedSeqs = () =>
    received.flatMap((m) => ('seq' in m.decoded.message ? [m.decoded.message.seq] : []));

  beforeAll(async () => {
    broker = await startBroker();
    app = await createApp({ MQTT_URL: broker.url, MQTT_API_PASSWORD: API_PASSWORD });
    app.get(TelemetryStream).messages$.subscribe((message) => received.push(message));
    const ingestion = app.get(MqttIngestionService);
    await waitFor(() => ingestion.connected);
    publisher = await mqtt.connectAsync(broker.url, {
      protocolVersion: 5,
      username: 'simulator',
      password: SIMULATOR_PASSWORD,
      reconnectPeriod: 200,
    });
  });

  afterAll(async () => {
    await publisher.endAsync();
    await app.close();
    await broker.container.stop();
  });

  it('acepta un mensaje válido y lo publica en el flujo interno', async () => {
    await publish('state', buildStateMessage({ seq: 1 }));
    await waitFor(() => received.length === 1);
    expect(received[0]?.decoded).toMatchObject({
      ok: true,
      kind: 'state',
      address: { siteId: 'demo', cellId: 'cell-01' },
      message: { state: 'RUNNING', seq: 1 },
    });
    expect(received[0]?.receivedAt).toMatch(/Z$/);
  });

  it('descarta los mensajes inválidos sin detener la suscripción', async () => {
    const before = received.length;
    await publish('state', 'esto no es JSON');
    await publish('state', { ...buildStateMessage({ seq: 2 }), state: 'IDLE' });
    await publish('state', buildStateMessage({ seq: 2 }), 'cell-02');
    await publish('telemetry', buildTelemetryMessage({ seq: 1, boxesTotal: 42 }));
    await waitFor(() => received.length === before + 1);
    expect(received.at(-1)?.decoded).toMatchObject({
      kind: 'telemetry',
      message: { boxesTotal: 42 },
    });
  });

  it('descarta los duplicados y los mensajes desordenados', async () => {
    await publish('state', buildStateMessage({ seq: 1 }));
    await publish('state', buildStateMessage({ seq: 5 }));
    await publish('state', buildStateMessage({ seq: 3 }));
    await publish('state', buildStateMessage({ seq: 6 }));
    await waitFor(() => receivedSeqs().includes(6));
    const stateSeqs = received
      .filter((m) => m.decoded.kind === 'state')
      .map((m) => ('seq' in m.decoded.message ? m.decoded.message.seq : -1));
    expect(stateSeqs).toEqual([1, 5, 6]);
  });

  it('se reconecta sola cuando el broker se reinicia', async () => {
    const ingestion = app.get(MqttIngestionService);
    await broker.container.restart();
    await waitFor(() => ingestion.connected);
    await waitFor(() => publisher.connected);
    await publish(
      'state',
      buildStateMessage({ seq: 0, sessionId: testUuid(9), timestamp: '2026-10-05T09:00:00.000Z' }),
    );
    await waitFor(() => received.some((m) => m.decoded.message.sessionId === testUuid(9)));
  });
});
