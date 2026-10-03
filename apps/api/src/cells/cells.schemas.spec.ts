import { describe, expect, it } from 'vitest';

import {
  cellParamsSchema,
  eventsQuerySchema,
  historyQuerySchema,
  productionQuerySchema,
} from './cells.schemas.ts';

const now = () => new Date('2026-10-05T12:00:00.000Z');
const parse = (query: object) => productionQuerySchema(now).safeParse(query);

describe('parámetros de la API REST', () => {
  it('sin fechas, consulta las últimas 24 horas', () => {
    expect(parse({}).data).toEqual({
      from: new Date('2026-10-04T12:00:00.000Z'),
      to: new Date('2026-10-05T12:00:00.000Z'),
    });
  });

  it('admite fechas con zona horaria', () => {
    expect(parse({ from: '2026-10-05T08:00:00+02:00', to: '2026-10-05T10:00:00Z' }).data).toEqual({
      from: new Date('2026-10-05T06:00:00.000Z'),
      to: new Date('2026-10-05T10:00:00.000Z'),
    });
  });

  it('con solo el inicio, consulta hasta ahora', () => {
    expect(parse({ from: '2026-10-05T11:00:00Z' }).data?.to).toEqual(now());
  });

  it.each([
    ['una fecha no válida', { from: 'ayer' }, 'from'],
    [
      'un inicio posterior al fin',
      { from: '2026-10-05T10:00:00Z', to: '2026-10-05T09:00:00Z' },
      'from',
    ],
    [
      'un rango de más de 31 días',
      { from: '2026-08-01T00:00:00Z', to: '2026-10-01T00:00:00Z' },
      'to',
    ],
  ])('rechaza %s', (_case, query, field) => {
    const result = parse(query);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it('valida la planta y la célula con el formato del contrato', () => {
    expect(cellParamsSchema.safeParse({ siteId: 'demo', cellId: 'cell-01' }).success).toBe(true);
    expect(cellParamsSchema.safeParse({ siteId: 'demo', cellId: 'Cell 01' }).success).toBe(false);
  });
});

describe('parámetros del histórico (LF-80)', () => {
  // 12:20 UTC: las 14:20 en Madrid (horario de verano).
  const history = (query: object) =>
    historyQuerySchema(() => new Date('2026-10-05T12:20:00.000Z')).safeParse(query);

  it('sin fechas, por horas, las últimas 24 horas con la actual', () => {
    expect(history({}).data).toEqual({
      from: new Date('2026-10-04T13:00:00.000Z'),
      to: new Date('2026-10-05T13:00:00.000Z'),
      resolution: 'hour',
      timeZone: 'UTC',
    });
  });

  it('sin fechas, por días, los últimos 7 días locales con el actual', () => {
    expect(history({ resolution: 'day', timeZone: 'Europe/Madrid' }).data).toMatchObject({
      from: new Date('2026-09-28T22:00:00.000Z'),
      to: new Date('2026-10-05T22:00:00.000Z'),
    });
  });

  it('cuenta los días de 25 horas del cambio de hora', () => {
    const result = history({
      resolution: 'day',
      timeZone: 'Europe/Madrid',
      from: '2026-10-25T00:00:00+02:00',
      to: '2026-10-26T00:00:00+01:00',
    });
    expect(result.success).toBe(true);
    expect((result.data?.to.getTime() ?? 0) - (result.data?.from.getTime() ?? 0)).toBe(
      25 * 3_600_000,
    );
  });

  it.each([
    ['una hora que no es en punto', { from: '2026-10-05T08:30:00Z' }, 'from'],
    ['una resolución desconocida', { resolution: 'minute' }, 'resolution'],
    ['una zona horaria desconocida', { timeZone: 'Marte/Olimpo' }, 'timeZone'],
    [
      'un día que no empieza a medianoche local',
      {
        resolution: 'day',
        timeZone: 'Europe/Madrid',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-02T22:00:00Z',
      },
      'from',
    ],
    [
      'más de 31 días por horas',
      { from: '2026-08-01T00:00:00Z', to: '2026-10-01T00:00:00Z' },
      'to',
    ],
    [
      'más de 366 días por días',
      { resolution: 'day', from: '2025-01-01T00:00:00Z', to: '2026-10-01T00:00:00Z' },
      'to',
    ],
  ])('rechaza %s', (_case, query, field) => {
    const result = history(query);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it('admite un año por días', () => {
    expect(
      history({ resolution: 'day', from: '2025-10-01T00:00:00Z', to: '2026-10-01T00:00:00Z' })
        .success,
    ).toBe(true);
  });
});

describe('parámetros del registro de eventos (LF-84)', () => {
  const events = (query: object) => eventsQuerySchema(now).safeParse(query);

  it('sin parámetros, las últimas 24 horas y 200 eventos', () => {
    expect(events({}).data).toEqual({
      from: new Date('2026-10-04T12:00:00.000Z'),
      to: new Date('2026-10-05T12:00:00.000Z'),
      limit: 200,
    });
  });

  it.each([
    ['más de 500 eventos', { limit: '501' }, 'limit'],
    ['un rango invertido', { from: '2026-10-05T10:00:00Z', to: '2026-10-05T09:00:00Z' }, 'from'],
  ])('rechaza %s', (_case, query, field) => {
    expect(events(query).error?.issues[0]?.path).toEqual([field]);
  });
});
