import { describe, expect, it } from 'vitest';

import { periodQuery } from './period';

// 12:20 UTC: las 14:20 en Madrid, en horario de verano.
const NOW = new Date('2026-10-05T12:20:00.000Z');

describe('periodos del histórico', () => {
  it('hoy: por horas, desde la medianoche local hasta la hora en curso incluida', () => {
    expect(periodQuery('today', NOW, 'Europe/Madrid')).toEqual({
      from: '2026-10-04T22:00:00.000Z',
      to: '2026-10-05T13:00:00.000Z',
      resolution: 'hour',
      timeZone: 'Europe/Madrid',
    });
  });

  it('7 días: por días locales, con el día en curso', () => {
    expect(periodQuery('week', NOW, 'Europe/Madrid')).toEqual({
      from: '2026-09-28T22:00:00.000Z',
      to: '2026-10-05T22:00:00.000Z',
      resolution: 'day',
      timeZone: 'Europe/Madrid',
    });
  });

  it('30 días atraviesa el cambio de hora', () => {
    const query = periodQuery('month', new Date('2026-11-10T10:00:00.000Z'), 'Europe/Madrid');
    expect(query).toMatchObject({
      from: '2026-10-11T22:00:00.000Z',
      to: '2026-11-10T23:00:00.000Z',
    });
  });

  it('en UTC, los días empiezan a las 00:00 UTC', () => {
    expect(periodQuery('week', NOW, 'UTC')).toMatchObject({
      from: '2026-09-29T00:00:00.000Z',
      to: '2026-10-06T00:00:00.000Z',
    });
  });

  it('con una zona de media hora, usa UTC', () => {
    expect(periodQuery('today', NOW, 'Asia/Kolkata')).toMatchObject({
      from: '2026-10-05T00:00:00.000Z',
      timeZone: 'UTC',
    });
  });
});
