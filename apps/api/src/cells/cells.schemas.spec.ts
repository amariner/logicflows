import { describe, expect, it } from 'vitest';

import { cellParamsSchema, productionQuerySchema } from './cells.schemas.ts';

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
