import { describe, expect, it } from 'vitest';

import { formatAlarms, formatDuration, formatRatio, toHistoryView } from './history-view';
import type { CellHistory, PeriodIndicators } from './history.types';

const period = (from: string, to: string, values: Partial<PeriodIndicators> = {}) =>
  ({
    from,
    to,
    boxes: 0,
    pallets: 0,
    seconds: {
      total: 3600,
      noData: 0,
      outOfProduction: 0,
      planned: 3600,
      running: 3600,
      stopped: 0,
    },
    availability: 1,
    performance: 1,
    stops: [],
    alarms: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    ...values,
  }) satisfies PeriodIndicators;

const history = (values: Partial<CellHistory> = {}): CellHistory => ({
  siteId: 'demo',
  cellId: 'cell-01',
  from: '2026-10-05T06:00:00.000Z',
  to: '2026-10-05T08:00:00.000Z',
  resolution: 'hour',
  timeZone: 'Europe/Madrid',
  nominalBoxesPerHour: 900,
  summary: period('2026-10-05T06:00:00.000Z', '2026-10-05T08:00:00.000Z', {
    boxes: 5130,
    pallets: 128,
    seconds: {
      total: 28_800,
      noData: 0,
      outOfProduction: 3600,
      planned: 25_200,
      running: 22_800,
      stopped: 2400,
    },
    availability: 22_800 / 25_200,
    performance: 0.9,
    stops: [
      { cause: 'FAULT', alarmCode: 'ROB-001', seconds: 1500, count: 2 },
      { cause: 'STARVED', alarmCode: null, seconds: 600, count: 3 },
      { cause: 'PAUSED', alarmCode: null, seconds: 180, count: 1 },
    ],
  }),
  periods: [
    period('2026-10-05T06:00:00.000Z', '2026-10-05T07:00:00.000Z', { boxes: 800 }),
    period('2026-10-05T07:00:00.000Z', '2026-10-05T08:00:00.000Z', {
      boxes: 400,
      availability: null,
      performance: null,
    }),
  ],
  ...values,
});

describe('presentación del histórico', () => {
  it('formatea los indicadores del periodo', () => {
    expect(toHistoryView(history())).toMatchObject({
      availability: '90,5\u00a0%',
      performance: '90\u00a0%',
      boxes: '5130',
      pallets: '128',
      running: '6 h 20 min',
      planned: '7 h',
      noData: '0 s',
      nominal: '900 cajas/h',
      alarms: 'ninguna',
      empty: false,
    });
  });

  it('prepara una barra por hora, con su altura relativa y su etiqueta local', () => {
    const view = toHistoryView(history());
    expect(view.chartTitle).toBe('Cajas por hora');
    expect(view.bars).toEqual([
      {
        label: '08:00',
        longLabel: 'De 08:00 a 09:00',
        boxes: '800',
        ratio: 1,
        availability: '100\u00a0%',
        performance: '100\u00a0%',
      },
      {
        label: '09:00',
        longLabel: 'De 09:00 a 10:00',
        boxes: '400',
        ratio: 0.5,
        availability: '—',
        performance: '—',
      },
    ]);
    expect(view.chartSummary).toBe(
      '5130 cajas en total. La hora con más producción: de 08:00 a 09:00, con 800 cajas.',
    );
  });

  it('por días, etiqueta cada día en la zona horaria', () => {
    const view = toHistoryView(
      history({
        resolution: 'day',
        periods: [period('2026-10-04T22:00:00.000Z', '2026-10-05T22:00:00.000Z', { boxes: 10 })],
      }),
    );
    expect(view.bars[0]).toMatchObject({ label: '5/10', longLabel: 'Lunes, 5 de octubre' });
    expect(view.chartTitle).toBe('Cajas por día');
  });

  it('lista las paradas con su causa, su duración y sus veces', () => {
    expect(toHistoryView(history()).stops).toEqual([
      { label: 'Fallo ROB-001', duration: '25 min', count: '2 veces', ratio: 1 },
      { label: 'Sin cajas a la entrada', duration: '10 min', count: '3 veces', ratio: 0.4 },
      { label: 'Pausa del operario', duration: '3 min', count: '1 vez', ratio: 0.12 },
    ]);
  });

  it('sin ningún dato, lo indica', () => {
    const empty = period('2026-10-05T06:00:00.000Z', '2026-10-05T07:00:00.000Z', {
      seconds: {
        total: 3600,
        noData: 3600,
        outOfProduction: 0,
        planned: 0,
        running: 0,
        stopped: 0,
      },
      availability: null,
      performance: null,
    });
    const view = toHistoryView(history({ summary: empty, periods: [empty] }));
    expect(view.empty).toBe(true);
    expect(view.chartSummary).toBe('Sin producción en el periodo.');
  });

  it('formatea duraciones y fracciones', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(90_000)).toBe('25 h');
    expect(formatRatio(null)).toBe('—');
    expect(formatRatio(0.8974)).toBe('89,7\u00a0%');
  });

  it('resume las alarmas por gravedad, de más a menos grave', () => {
    expect(formatAlarms({ CRITICAL: 1, HIGH: 2, MEDIUM: 0, LOW: 1 })).toBe(
      '1 crítica · 2 altas · 1 baja',
    );
  });
});
