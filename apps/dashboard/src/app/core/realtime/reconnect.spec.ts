import { describe, expect, it } from 'vitest';

import { reconnectDelay } from './reconnect';

describe('espera de reconexión', () => {
  it('crece de forma exponencial hasta 30 segundos', () => {
    const max = (attempt: number) => reconnectDelay(attempt, () => 1);
    expect([0, 1, 2, 3, 4, 5, 6].map(max)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ]);
  });

  it('varía entre la mitad y el total para repartir las reconexiones', () => {
    expect(reconnectDelay(3, () => 0)).toBe(4_000);
    expect(reconnectDelay(3, () => 0.5)).toBe(6_000);
  });
});
