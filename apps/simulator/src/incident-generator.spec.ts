import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FAULT_ALARMS } from './domain/alarms.ts';
import { IncidentGenerator, randomDuration } from './incident-generator.ts';
import { SCENARIOS } from './scenarios.ts';
import type { Scenario } from './scenarios.ts';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const setup = (random: () => number, scenario: Scenario = SCENARIOS.demo) => {
  const target = {
    fault: vi.fn(() => true),
    emergencyStop: vi.fn(() => true),
    supplyInterruption: vi.fn(() => true),
    pause: vi.fn(() => true),
  };
  const connection = { interrupt: vi.fn() };
  const generator = new IncidentGenerator({
    target,
    rates: scenario.incidents,
    network: scenario.network === null ? null : { ...scenario.network, connection },
    random,
    logger,
  });
  return { generator, target, connection };
};

describe('generador de incidencias', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no provoca nada cuando el aleatorio supera todas las probabilidades', () => {
    const { generator, target, connection } = setup(() => 0.999);
    generator.tick();
    expect(Object.values(target).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(connection.interrupt).not.toHaveBeenCalled();
  });

  it('provoca cada incidencia cuando el aleatorio queda por debajo de su probabilidad', () => {
    const { generator, target, connection } = setup(() => 0);
    generator.tick();
    expect(target.emergencyStop).toHaveBeenCalledOnce();
    expect(target.fault).toHaveBeenCalledWith(FAULT_ALARMS[0]);
    expect(target.supplyInterruption).toHaveBeenCalledWith('STARVED', 10_000);
    expect(target.supplyInterruption).toHaveBeenCalledWith('BLOCKED', 10_000);
    expect(target.pause).toHaveBeenCalledWith(10_000);
    expect(connection.interrupt).toHaveBeenCalledWith(5_000);
  });

  it('la probabilidad por segundo corresponde a la frecuencia por hora', () => {
    // demo: 30 fallos por hora → 30 / 3.600 por segundo.
    const threshold = 30 / 3_600;
    const below = setup(() => threshold - 1e-9, { ...SCENARIOS.demo, network: null });
    below.generator.tick();
    expect(below.target.fault).toHaveBeenCalled();
    const above = setup(() => threshold, { ...SCENARIOS.demo, network: null });
    above.generator.tick();
    expect(above.target.fault).not.toHaveBeenCalled();
  });

  it('evalúa las incidencias cada segundo mientras está en marcha', () => {
    const { generator, target } = setup(() => 0);
    generator.start();
    vi.advanceTimersByTime(3_000);
    expect(target.emergencyStop).toHaveBeenCalledTimes(3);
    generator.stop();
    vi.advanceTimersByTime(3_000);
    expect(target.emergencyStop).toHaveBeenCalledTimes(3);
  });

  it('en el escenario normal no programa nada', () => {
    const { generator, target } = setup(() => 0, SCENARIOS.normal);
    generator.start();
    vi.advanceTimersByTime(10_000);
    expect(target.fault).not.toHaveBeenCalled();
  });

  it('elige duraciones dentro del intervalo', () => {
    const range = { minMs: 1_000, maxMs: 3_000 };
    expect(randomDuration(range, () => 0)).toBe(1_000);
    expect(randomDuration(range, () => 0.5)).toBe(2_000);
    expect(randomDuration(range, () => 0.999_999)).toBe(3_000);
  });
});
