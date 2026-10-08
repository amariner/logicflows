import { describe, expect, it } from 'vitest';

import type { PeriodIndicators } from '../history/history.types';
import { comparisonCsvName, toComparisonCsv } from './comparison-csv';
import { toComparisonView } from './comparison-view';
import type { SiteComparison } from './comparison.types';

const summary = (values: Partial<PeriodIndicators> = {}): PeriodIndicators => ({
  from: '2026-10-04T22:00:00.000Z',
  to: '2026-10-05T22:00:00.000Z',
  boxes: 15_000,
  pallets: 375,
  seconds: {
    total: 86_400,
    shift: 57_600,
    noData: 0,
    outOfProduction: 28_800,
    planned: 57_600,
    running: 51_840,
    stopped: 5760,
  },
  availability: 0.9,
  performance: 0.95,
  stops: [{ cause: 'FAULT', alarmCode: 'ROB-001', seconds: 3600, count: 2 }],
  alarms: { CRITICAL: 0, HIGH: 2, MEDIUM: 0, LOW: 0 },
  ...values,
});

const comparison: SiteComparison = {
  siteId: 'demo',
  from: '2026-10-04T22:00:00.000Z',
  to: '2026-10-05T22:00:00.000Z',
  timeZone: 'Europe/Madrid',
  cells: [
    { cellId: 'cell-01', nominalBoxesPerHour: 900, summary: summary() },
    {
      cellId: 'cell-02',
      nominalBoxesPerHour: 900,
      summary: summary({ boxes: 12_000, availability: 0.75, performance: 0.8, stops: [] }),
    },
    {
      cellId: 'cell-03',
      nominalBoxesPerHour: 900,
      summary: summary({ boxes: 0, availability: null, performance: null }),
    },
  ],
};

describe('comparación de células (LF-130)', () => {
  it('una fila por célula, con sus indicadores y su parada principal', () => {
    const view = toComparisonView(comparison, { key: 'cell', descending: false });
    expect(view.rows[0]).toEqual({
      cellId: 'cell-01',
      boxes: '15.000',
      availability: '90\u00a0%',
      performance: '95\u00a0%',
      mainStop: 'Fallo ROB-001 · 1 h',
      worst: false,
    });
    expect(view.rows[1]?.mainStop).toBe('—');
  });

  it('señala la de menor disponibilidad con texto, no solo con color', () => {
    const view = toComparisonView(comparison, { key: 'cell', descending: false });
    expect(view.rows.filter((row) => row.worst).map((row) => row.cellId)).toEqual(['cell-02']);
    expect(view.worstNote).toBe('cell-02 tiene la menor disponibilidad: 75\u00a0%');
  });

  it('sin una peor clara, no señala ninguna', () => {
    const tied = {
      ...comparison,
      cells: comparison.cells.map((cell) => ({ ...cell, summary: summary() })),
    };
    expect(toComparisonView(tied, { key: 'cell', descending: false }).worstNote).toBeNull();
  });

  it('ordena por cada indicador, con las células sin dato al final', () => {
    const ascending = toComparisonView(comparison, { key: 'availability', descending: false });
    expect(ascending.rows.map((row) => row.cellId)).toEqual(['cell-02', 'cell-01', 'cell-03']);
    const descending = toComparisonView(comparison, { key: 'availability', descending: true });
    expect(descending.rows.map((row) => row.cellId)).toEqual(['cell-01', 'cell-02', 'cell-03']);
    const byBoxes = toComparisonView(comparison, { key: 'boxes', descending: true });
    expect(byBoxes.rows.map((row) => row.cellId)).toEqual(['cell-01', 'cell-02', 'cell-03']);
  });

  it('descarga una fila por célula, como el CSV del histórico', () => {
    const lines = toComparisonCsv(comparison).split('\r\n');
    expect(lines[0]).toBe(
      '﻿Célula;Cajas;Palés;Tiempo total (s);Tiempo de turno (s);Sin datos (s);Fuera de producción (s);Planificado (s);En producción (s);Paradas (s);Disponibilidad (%);Rendimiento (%);Parada principal;Parada principal (s)',
    );
    expect(lines[1]).toBe(
      'cell-01;15000;375;86400;57600;0;28800;57600;51840;5760;90,0;95,0;Fallo ROB-001;3600',
    );
    expect(lines[3]).toBe(
      'cell-03;0;375;86400;57600;0;28800;57600;51840;5760;;;Fallo ROB-001;3600',
    );
    expect(comparisonCsvName(comparison)).toBe('comparacion-demo-2026-10-04-2026-10-05.csv');
  });
});
