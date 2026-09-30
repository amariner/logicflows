import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestSimulator } from './testing/simulator.ts';

const setup = (startupDurationMs = 2_000, random: () => number = () => 0.5) =>
  createTestSimulator({ startupDurationMs }, random);

describe('simulador', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-05T08:00:00.000Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('al conectar publica su conexión, su estado y su telemetría', () => {
    const { connection, simulator } = setup();
    simulator.start();
    connection.connect();

    expect(connection.ofKind('status')).toEqual([expect.objectContaining({ online: true })]);
    expect(connection.optionsOf('status')).toEqual([{ qos: 1, retain: true }]);
    expect(connection.ofKind('state').at(-1)).toMatchObject({ state: 'STARTING' });
    expect(connection.optionsOf('state')).toContainEqual({ qos: 1, retain: true });
    expect(connection.optionsOf('telemetry')).toEqual([{ qos: 0, retain: true }]);
  });

  it('arranca, pasa a producir y publica una telemetría por cada caja', () => {
    const { connection, simulator } = setup();
    simulator.start();
    connection.connect();

    vi.advanceTimersByTime(2_000);
    expect(simulator.cell.status.state).toBe('RUNNING');
    expect(connection.ofKind('state').at(-1)).toMatchObject({
      previousState: 'STARTING',
      state: 'RUNNING',
      event: 'started',
    });

    // La primera caja llega un intervalo después de empezar a producir.
    vi.advanceTimersByTime(3_000);
    const boxes = connection.ofKind('telemetry').map((t) => t.boxesTotal);
    expect(boxes.slice(-3)).toEqual([1, 2, 3]);
    expect(connection.ofKind('telemetry').at(-1)).toMatchObject({
      palletsTotal: 0,
      pallet: { currentLayer: 2, boxesInLayer: 1 },
      cycleTimeMs: 1_000,
    });
  });

  it('no paletiza cajas durante la secuencia de arranque', () => {
    const { connection, simulator } = setup();
    simulator.start();
    connection.connect();
    vi.advanceTimersByTime(1_500);
    expect(connection.ofKind('telemetry').every((t) => t.boxesTotal === 0)).toBe(true);
  });

  it('publica telemetría al menos cada 10 segundos aunque no haya cajas', () => {
    const { connection, simulator } = setup(30_000);
    simulator.start();
    connection.connect();
    const initial = connection.ofKind('telemetry').length;

    vi.advanceTimersByTime(9_999);
    expect(connection.ofKind('telemetry')).toHaveLength(initial);
    vi.advanceTimersByTime(1);
    expect(connection.ofKind('telemetry')).toHaveLength(initial + 1);
    vi.advanceTimersByTime(10_000);
    expect(connection.ofKind('telemetry')).toHaveLength(initial + 2);
  });

  it('tras completar un pallet espera el cambio de pallet antes de la siguiente caja', () => {
    const { connection, simulator } = setup();
    simulator.start();
    connection.connect();
    // Arranque de 2 s y una caja por segundo: el pallet de 2 × 2 se completa a los 6 s.
    vi.advanceTimersByTime(6_000);
    expect(connection.ofKind('telemetry').at(-1)).toMatchObject({ boxesTotal: 4, palletsTotal: 1 });

    // Cambio de pallet de 5 s más un ciclo: la siguiente caja llega a los 12 s.
    vi.advanceTimersByTime(5_999);
    expect(simulator.cell.production(Date.now()).boxesTotal).toBe(4);
    vi.advanceTimersByTime(1);
    expect(simulator.cell.production(Date.now()).boxesTotal).toBe(5);
    expect(connection.ofKind('telemetry').at(-1)?.cycleTimeMs).toBe(6_000);
  });

  it('varía el tiempo de ciclo según la fuente aleatoria', () => {
    const { connection, simulator } = setup(2_000, () => 1);
    simulator.start();
    connection.connect();
    // Con el aleatorio al máximo cada ciclo dura un 10 % más: 1.100 ms.
    vi.advanceTimersByTime(2_000 + 1_099);
    expect(simulator.cell.production(Date.now()).boxesTotal).toBe(0);
    vi.advanceTimersByTime(1);
    expect(simulator.cell.production(Date.now()).boxesTotal).toBe(1);
    vi.advanceTimersByTime(1_100);
    expect(connection.ofKind('telemetry').at(-1)?.cycleTimeMs).toBe(1_100);
  });

  it('las secuencias de state y telemetry crecen sin repetirse', () => {
    const { connection, simulator } = setup();
    simulator.start();
    connection.connect();
    vi.advanceTimersByTime(6_000);
    for (const kind of ['state', 'telemetry'] as const) {
      const seqs = connection.ofKind(kind).map((m) => m.seq);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      expect(new Set(seqs).size).toBe(seqs.length);
    }
  });

  it('vuelve a publicar su situación completa tras reconectar', () => {
    const { connection, simulator } = setup();
    simulator.start();
    connection.connect();
    vi.advanceTimersByTime(4_000);
    const published = connection.published.length;

    connection.connected = false;
    connection.connect();

    const republished = connection.published.slice(published).map((p) => p.decoded.kind);
    expect(republished).toEqual(['status', 'state', 'telemetry']);
    expect(connection.ofKind('state').at(-1)).toMatchObject({ state: 'RUNNING' });
  });

  it('al detenerse pasa a STOPPED, anuncia la desconexión y cierra la conexión', async () => {
    const { connection, simulator } = setup();
    simulator.start();
    connection.connect();
    vi.advanceTimersByTime(3_000);

    await simulator.stop();

    expect(connection.ofKind('state').at(-1)).toMatchObject({ state: 'STOPPED', event: 'stop' });
    expect(connection.ofKind('status').at(-1)).toMatchObject({ online: false });
    expect(connection.closed).toBe(true);

    const count = connection.published.length;
    vi.advanceTimersByTime(10_000);
    expect(connection.published).toHaveLength(count);
  });

  it('descarta la telemetría sin conexión sin interrumpir la simulación', () => {
    const { connection, simulator } = setup();
    simulator.start();
    // Arranque de 2 s y dos cajas, a los 3 y a los 4 segundos.
    vi.advanceTimersByTime(4_000);
    expect(simulator.cell.production(Date.now()).boxesTotal).toBe(2);
    expect(connection.ofKind('telemetry')).toHaveLength(0);
    connection.connect();
    expect(connection.ofKind('telemetry').at(-1)).toMatchObject({ boxesTotal: 2 });
  });
});
