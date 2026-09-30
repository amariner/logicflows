import { describe, expect, it } from 'vitest';

import { ThroughputMeter } from './throughput.ts';

describe('ritmo de producción', () => {
  it('es cero sin cajas', () => {
    expect(new ThroughputMeter().boxesPerHour(0)).toBe(0);
  });

  it('extrapola a cajas por hora las cajas del último minuto', () => {
    const meter = new ThroughputMeter();
    for (let second = 0; second < 60; second += 4) {
      meter.record(second * 1_000);
    }
    // 15 cajas en un minuto: una cada 4 segundos.
    expect(meter.boxesPerHour(59_000)).toBe(900);
  });

  it('olvida las cajas de hace más de 60 segundos', () => {
    const meter = new ThroughputMeter();
    meter.record(0);
    meter.record(30_000);
    expect(meter.boxesPerHour(60_000)).toBe(60);
    expect(meter.boxesPerHour(91_000)).toBe(0);
  });
});
