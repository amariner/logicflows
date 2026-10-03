import { describe, expect, it } from 'vitest';

import { computeIndicators } from './indicators.ts';
import type { HourRow } from './indicators.ts';

const T = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00.000Z`);
const NOW = T('23:00');
const row = (hhmm: string, values: Partial<HourRow> = {}): HourRow => ({
  hour: T(hhmm),
  boxes: 0,
  pallets: 0,
  seconds: {},
  stops: {},
  alarms: {},
  computedAt: NOW,
  ...values,
});

/** El turno de 8 horas de docs/indicadores-de-planta.md, resumido en su primera hora. */
const shift = row('06:00', {
  boxes: 5130,
  pallets: 128,
  seconds: {
    STOPPED: 3600,
    STARTING: 120,
    RUNNING: 22_800,
    FAULT: 1500,
    WAITING_STARVED: 600,
    PAUSED: 180,
  },
  stops: {
    'FAULT:ROB-001': { seconds: 1500, count: 2 },
    STARVED: { seconds: 600, count: 3 },
    PAUSED: { seconds: 180, count: 1 },
    STARTING: { seconds: 120, count: 1 },
  },
  alarms: { HIGH: 2 },
});

describe('indicadores de planta (LF-78)', () => {
  it('ejemplo 1: un turno de 8 horas', () => {
    const indicators = computeIndicators([shift], T('06:00'), T('14:00'), NOW, 900);
    expect(indicators.seconds).toEqual({
      total: 28_800,
      noData: 0,
      outOfProduction: 3600,
      planned: 25_200,
      running: 22_800,
      stopped: 2400,
    });
    expect(indicators.availability).toBeCloseTo(0.905, 3);
    expect(indicators.performance).toBeCloseTo(0.9, 6);
    expect(indicators.stops).toEqual([
      { cause: 'FAULT', alarmCode: 'ROB-001', seconds: 1500, count: 2 },
      { cause: 'STARVED', alarmCode: null, seconds: 600, count: 3 },
      { cause: 'PAUSED', alarmCode: null, seconds: 180, count: 1 },
      { cause: 'STARTING', alarmCode: null, seconds: 120, count: 1 },
    ]);
    expect(indicators.alarms).toEqual({ CRITICAL: 0, HIGH: 2, MEDIUM: 0, LOW: 0 });
    expect(indicators.boxes).toBe(5130);
  });

  it('ejemplo 2: la célula se desconecta y ese tiempo queda sin datos', () => {
    const disconnected = row('06:00', {
      ...shift,
      boxes: 4725,
      seconds: { ...shift.seconds, RUNNING: 21_000, NO_DATA: 1800 },
    });
    const indicators = computeIndicators([disconnected], T('06:00'), T('14:00'), NOW, 900);
    expect(indicators.seconds).toMatchObject({ noData: 1800, planned: 23_400 });
    expect(indicators.availability).toBeCloseTo(0.897, 3);
    expect(indicators.performance).toBeCloseTo(0.9, 6);
  });

  it('ejemplo 3: sin tiempo planificado, los indicadores no están definidos', () => {
    const night = [row('22:00', { seconds: { STOPPED: 3600 } })];
    const indicators = computeIndicators(night, T('22:00'), T('23:00'), NOW, 900);
    expect(indicators.seconds).toMatchObject({ total: 3600, planned: 0, outOfProduction: 3600 });
    expect(indicators.availability).toBeNull();
    expect(indicators.performance).toBeNull();
  });

  it('una hora sin agregado cuenta como tiempo sin datos', () => {
    const indicators = computeIndicators(
      [row('10:00', { seconds: { RUNNING: 3600 }, boxes: 900 })],
      T('09:00'),
      T('11:00'),
      NOW,
      900,
    );
    expect(indicators.seconds).toMatchObject({ total: 7200, noData: 3600, running: 3600 });
    expect(indicators.availability).toBe(1);
    expect(indicators.performance).toBe(1);
  });

  it('de la hora en curso solo cuenta lo ya agregado, y nada del futuro', () => {
    const now = new Date('2026-10-05T10:20:00.000Z');
    const indicators = computeIndicators(
      [
        row('10:00', {
          seconds: { RUNNING: 1185 },
          computedAt: new Date('2026-10-05T10:19:45.000Z'),
        }),
      ],
      T('10:00'),
      T('12:00'),
      now,
      900,
    );
    expect(indicators.seconds).toMatchObject({ total: 1185, noData: 0, running: 1185 });
  });

  it('sin agregado, la hora en curso cuenta sin datos hasta ahora', () => {
    const now = new Date('2026-10-05T10:20:00.000Z');
    const indicators = computeIndicators([], T('10:00'), T('11:00'), now, 900);
    expect(indicators.seconds).toMatchObject({ total: 1200, noData: 1200 });
    expect(indicators.availability).toBeNull();
  });
});
