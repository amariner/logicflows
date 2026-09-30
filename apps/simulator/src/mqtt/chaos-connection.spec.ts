import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withNetworkChaos } from './chaos-connection.ts';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const options = { qos: 1, retain: true } as const;
const chaos = {
  disconnectPerHour: 0,
  disconnectDuration: { minMs: 1_000, maxMs: 1_000 },
  duplicateProbability: 0.1,
  delayProbability: 0.1,
  delay: { minMs: 2_000, maxMs: 2_000 },
};

const inner = () => {
  const published: string[] = [];
  return {
    published,
    connection: {
      publish: vi.fn((_topic: string, payload: string) => {
        published.push(payload);
        return Promise.resolve();
      }),
      onConnect: vi.fn(),
      interrupt: vi.fn(),
      close: vi.fn(() => Promise.resolve()),
    },
  };
};

/** Fuente aleatoria que devuelve los valores indicados en orden. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0.5;
};

describe('red poco fiable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('envía los mensajes con normalidad la mayoría de las veces', async () => {
    const { connection, published } = inner();
    const chaotic = withNetworkChaos(connection, chaos, () => 0.5, logger);
    await chaotic.publish('t', 'a', options);
    expect(published).toEqual(['a']);
  });

  it('duplica un mensaje como un reintento de QoS 1', async () => {
    const { connection, published } = inner();
    // Sin retraso (0,5) y con duplicado (0,05).
    const chaotic = withNetworkChaos(connection, chaos, sequence(0.5, 0.05), logger);
    await chaotic.publish('t', 'a', options);
    expect(published).toEqual(['a', 'a']);
  });

  it('retrasa un mensaje para que llegue después del siguiente', async () => {
    const { connection, published } = inner();
    // Primer mensaje retrasado (0,05) y ninguno duplicado (0,5).
    const chaotic = withNetworkChaos(connection, chaos, sequence(0.05, 0.5, 0.5, 0.5, 0.5), logger);
    await chaotic.publish('t', 'primero', options);
    await chaotic.publish('t', 'segundo', options);
    expect(published).toEqual(['segundo']);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(published).toEqual(['segundo', 'primero']);
  });

  it('delega los cortes y el cierre en la conexión real', async () => {
    const { connection } = inner();
    const chaotic = withNetworkChaos(connection, chaos, () => 0.5, logger);
    chaotic.interrupt(3_000);
    await chaotic.close();
    expect(connection.interrupt).toHaveBeenCalledWith(3_000);
    expect(connection.close).toHaveBeenCalledOnce();
  });
});
