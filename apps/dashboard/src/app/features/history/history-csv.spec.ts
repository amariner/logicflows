import { describe, expect, it } from 'vitest';

import { historyCsvName, toHistoryCsv } from './history-csv';
import type { CellHistory, PeriodIndicators } from './history.types';

const period = (from: string, to: string, values: Partial<PeriodIndicators> = {}) =>
  ({
    from,
    to,
    boxes: 810,
    pallets: 20,
    seconds: {
      total: 3600,
      noData: 0,
      outOfProduction: 0,
      planned: 3600,
      running: 3240,
      stopped: 360,
    },
    availability: 0.9,
    performance: 1,
    stops: [],
    alarms: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    ...values,
  }) satisfies PeriodIndicators;

const history: CellHistory = {
  siteId: 'demo',
  cellId: 'cell-01',
  from: '2026-10-04T22:00:00.000Z',
  to: '2026-10-05T00:00:00.000Z',
  resolution: 'hour',
  timeZone: 'Europe/Madrid',
  nominalBoxesPerHour: 900,
  summary: period('2026-10-04T22:00:00.000Z', '2026-10-05T00:00:00.000Z'),
  periods: [
    period('2026-10-04T22:00:00.000Z', '2026-10-04T23:00:00.000Z', { performance: 0.9047 }),
    period('2026-10-04T23:00:00.000Z', '2026-10-05T00:00:00.000Z', {
      boxes: 0,
      availability: null,
      performance: null,
    }),
  ],
};

describe('histórico en CSV (LF-88)', () => {
  it('una fila por periodo, en hora local, con separador ; y decimales con coma', () => {
    const lines = toHistoryCsv(history).split('\r\n');
    expect(lines[0]).toBe(
      '﻿Desde;Hasta;Cajas;Pallets;Tiempo total (s);Sin datos (s);Fuera de producción (s);Planificado (s);En producción (s);Paradas (s);Disponibilidad (%);Rendimiento (%)',
    );
    expect(lines[1]).toBe(
      '2026-10-05 00:00;2026-10-05 01:00;810;20;3600;0;0;3600;3240;360;90,0;90,5',
    );
    expect(lines[2]).toBe('2026-10-05 01:00;2026-10-05 02:00;0;20;3600;0;0;3600;3240;360;;');
    expect(lines[3]).toBe('');
  });

  it('el nombre del fichero dice la célula, el día local y la resolución', () => {
    expect(historyCsvName(history)).toBe('historico-demo-cell-01-2026-10-05-horas.csv');
  });
});
