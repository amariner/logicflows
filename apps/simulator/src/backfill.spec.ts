import { decodeMessage } from '@logicflows/contract';
import { describe, expect, it } from 'vitest';

import type { BrokerConnection, PublishOptions } from './broker.ts';
import { backfill } from './backfill.ts';
import { createRandom } from './domain/random.ts';
import { MessageFactory } from './messages.ts';
import { SCENARIOS } from './scenarios.ts';

const HOUR_MS = 3_600_000;
const FROM = Date.parse('2026-09-01T06:00:00.000Z');

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Broker falso que guarda lo publicado. */
const recordingConnection = () => {
  const published: { topic: string; payload: string; options: PublishOptions }[] = [];
  const connection: BrokerConnection = {
    publish: (topic, payload, options) => {
      published.push({ topic, payload, options });
      return Promise.resolve();
    },
    onConnect: () => undefined,
    close: () => Promise.resolve(),
  };
  return { published, connection };
};

const run = async (hours: number, seed: number) => {
  const { published, connection } = recordingConnection();
  let id = 0;
  await backfill({
    simulator: {
      format: { layersPerPallet: 5, boxesPerLayer: 8 },
      boxIntervalMs: 4_000,
      cycleVariation: 0.1,
      palletChangeMs: 8_000,
      startupDurationMs: 3_000,
      faultRecoveryMs: 60_000,
      emergencyStopRecoveryMs: 90_000,
      restartDelayMs: 10_000,
      heartbeatMs: 10_000,
    },
    incidents: SCENARIOS.averias.incidents,
    fromMs: FROM,
    toMs: FROM + hours * HOUR_MS,
    connection,
    messages: new MessageFactory({
      siteId: 'demo',
      cellId: 'cell-01',
      sessionId: '0199a0b0-0000-7000-8000-000000000001',
      newId: () => `0199a0b0-0000-7000-8000-${String(++id).padStart(12, '0')}`,
    }),
    random: createRandom(seed),
    logger: silentLogger,
  });
  return published;
};

describe('histórico simulado (LF-77)', () => {
  it('publica mensajes válidos con las marcas de tiempo simuladas, sin retener', async () => {
    const published = await run(6, 77);
    expect(published.length).toBeGreaterThan(100);
    for (const { topic, payload, options } of published) {
      const decoded = decodeMessage(topic, payload);
      expect(decoded.ok).toBe(true);
      expect(options.retain).toBe(false);
      if (decoded.ok) {
        const at = Date.parse(decoded.message.timestamp);
        expect(at).toBeGreaterThanOrEqual(FROM);
        expect(at).toBeLessThanOrEqual(FROM + 6 * HOUR_MS);
      }
    }
  });

  it('las secuencias y los contadores avanzan en orden, con incidencias', async () => {
    const decoded = (await run(6, 77))
      .map(({ topic, payload }) => decodeMessage(topic, payload))
      .filter((d) => d.ok);
    const telemetry = decoded.flatMap((d) => (d.kind === 'telemetry' ? [d.message] : []));
    const states = decoded.flatMap((d) => (d.kind === 'state' ? [d.message] : []));
    expect(telemetry.map((t) => t.seq)).toEqual(
      [...telemetry.map((t) => t.seq)].sort((a, b) => a - b),
    );
    const boxes = telemetry.map((t) => t.boxesTotal);
    expect(boxes).toEqual([...boxes].sort((a, b) => a - b));
    // Hasta 900 cajas por hora; con averías, bastantes menos.
    expect(boxes.at(-1)).toBeGreaterThan(2_000);
    expect(new Set(states.map((s) => s.state))).toContain('FAULT');
  });

  it('espacia la telemetría: como mucho una cada 10 s salvo cambios de estado', async () => {
    const decoded = (await run(2, 77))
      .map(({ topic, payload }) => decodeMessage(topic, payload))
      .filter((d) => d.ok);
    const telemetry = decoded.filter((d) => d.kind === 'telemetry').length;
    const states = decoded.filter((d) => d.kind === 'state').length;
    // 2 horas a una cada 10 s son 720, más una por cada cambio de estado.
    expect(telemetry).toBeLessThanOrEqual(720 + states + 5);
  });

  it('con la misma semilla genera el mismo histórico', async () => {
    const first = await run(2, 7);
    const second = await run(2, 7);
    expect(second.map((p) => p.payload)).toEqual(first.map((p) => p.payload));
  });
});
