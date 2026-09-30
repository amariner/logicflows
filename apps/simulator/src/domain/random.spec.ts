import { describe, expect, it } from 'vitest';

import { cycleDurationMs } from './cycle.ts';
import { createRandom } from './random.ts';

describe('aleatoriedad reproducible', () => {
  it('la misma semilla produce la misma secuencia', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const sequence = (random: () => number) => Array.from({ length: 5 }, random);
    expect(sequence(a)).toEqual(sequence(b));
  });

  it('semillas distintas producen secuencias distintas', () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });

  it('genera valores en [0, 1)', () => {
    const random = createRandom(7);
    for (let i = 0; i < 1_000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('duración del ciclo', () => {
  it.each([
    [0, 3_600],
    [0.5, 4_000],
    [1, 4_400],
  ])('con aleatorio %s y ±10 %% dura %s ms', (value, expected) => {
    expect(cycleDurationMs(4_000, 0.1, () => value)).toBe(expected);
  });

  it('sin variación dura siempre el tiempo nominal', () => {
    expect(cycleDurationMs(4_000, 0, Math.random)).toBe(4_000);
  });
});
