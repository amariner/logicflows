import type { CellState } from '@logicflows/contract';
import { describe, expect, it } from 'vitest';

import type { CellView } from './cell-view';
import { summarizeStates } from './state-summary';

const cell = (state: CellState | null) => ({ state }) as CellView;

describe('resumen de estados del panel (LF-106)', () => {
  it('cuenta las células por estado, de lo más grave a lo normal', () => {
    const summary = summarizeStates([
      cell('RUNNING'),
      cell('FAULT'),
      cell('RUNNING'),
      cell(null),
      cell('EMERGENCY_STOP'),
      cell('WAITING'),
    ]);
    expect(summary.map((item) => item.label)).toEqual([
      '1 parada de emergencia',
      '1 fallo',
      '1 en espera',
      '2 produciendo',
      '1 sin datos',
    ]);
    expect(summary[0]?.tone).toBe('danger');
  });

  it('sin células no hay resumen', () => {
    expect(summarizeStates([])).toEqual([]);
  });
});
