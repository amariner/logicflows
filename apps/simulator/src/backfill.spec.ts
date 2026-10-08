import { decodeMessage } from '@logicflows/contract';
import { describe, expect, it } from 'vitest';

import type { BrokerConnection, PublishOptions } from './broker.ts';
import { backfill } from './backfill.ts';
import { createRandom } from './domain/random.ts';
import { MessageFactory } from './messages.ts';
import { SCENARIOS } from './scenarios.ts';
import type { Scenario } from './scenarios.ts';

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

const run = async (
  hours: number,
  seed: number,
  scenario: Scenario = SCENARIOS.averias,
  limits: Pick<Parameters<typeof backfill>[0], 'maxMessagesPerSecond' | 'pace'> = {},
) => {
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
    incidents: scenario.incidents,
    script: scenario.script,
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
    ...limits,
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

  it('no publica más deprisa que el límite: el broker no descarta mensajes (LF-123)', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const pace = {
      now: () => now,
      sleep: (ms: number) => {
        sleeps.push(ms);
        now += ms;
        return Promise.resolve();
      },
    };
    const published = await run(2, 7, SCENARIOS.normal, { maxMessagesPerSecond: 100, pace });
    // Sin tiempo real transcurrido, la carga espera lo que corresponde al ritmo.
    // Los últimos mensajes, al detenerse la célula, ya no esperan.
    expect(now).toBeLessThanOrEqual((published.length / 100) * 1000);
    expect(now).toBeGreaterThan(((published.length - 10) / 100) * 1000);
    expect(sleeps.length).toBeGreaterThan(1);
  });

  it('con la misma semilla genera el mismo histórico', async () => {
    const first = await run(2, 7);
    const second = await run(2, 7);
    expect(second.map((p) => p.payload)).toEqual(first.map((p) => p.payload));
  });

  it('con el escenario guion, cada incidencia ocurre a su hora local (ADR-0019)', async () => {
    // FROM son las 08:00 en Madrid: cuatro horas incluyen el fallo de las 09:47 y
    // la parada de las 11:15. Simular el día entero agotaba el límite de 5 s en
    // la CI cargada (LF-116).
    const published = await run(4, 7, SCENARIOS.guion);
    const states = published
      .map(({ topic, payload }) => decodeMessage(topic, payload))
      .flatMap((d) => (d.ok && d.kind === 'state' ? [d.message] : []));
    const entered = (state: string) =>
      states.filter((m) => m.state === state && m.previousState !== state).map((m) => m.since);
    expect(entered('EMERGENCY_STOP')).toEqual(['2026-09-01T09:15:00.000Z']);
    expect(entered('FAULT')).toContain('2026-09-01T07:47:00.000Z');
    const second = await run(4, 7, SCENARIOS.guion);
    expect(second.map((p) => p.payload)).toEqual(published.map((p) => p.payload));
  });
});
