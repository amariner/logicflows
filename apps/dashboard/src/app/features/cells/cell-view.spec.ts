import type { CellSnapshot } from '@logicflows/contract';
import { describe, expect, it } from 'vitest';

import { STATE_LABELS, toCellView } from './cell-view';

const empty: CellSnapshot = {
  siteId: 'demo',
  cellId: 'cell-01',
  status: null,
  state: null,
  telemetry: null,
};

describe('vista de una célula', () => {
  it('muestra una célula de la que aún no hay datos', () => {
    expect(toCellView(empty)).toEqual({
      id: 'demo/cell-01',
      siteId: 'demo',
      cellId: 'cell-01',
      online: null,
      state: null,
      stateLabel: 'Sin datos',
      boxesTotal: null,
      palletsTotal: null,
    });
  });

  it('traduce cada estado de ADR-0003', () => {
    expect(Object.keys(STATE_LABELS)).toHaveLength(7);
    expect(STATE_LABELS.EMERGENCY_STOP).toBe('Parada de emergencia');
  });

  it('añade la causa de la espera', () => {
    const view = toCellView({
      ...empty,
      state: { state: 'WAITING', waitingReason: 'STARVED' } as CellSnapshot['state'],
    });
    expect(view.stateLabel).toBe('En espera · sin cajas');
  });

  it('toma la conexión y los contadores de los últimos mensajes', () => {
    const view = toCellView({
      ...empty,
      status: { online: false } as CellSnapshot['status'],
      telemetry: { boxesTotal: 120, palletsTotal: 3 } as CellSnapshot['telemetry'],
    });
    expect(view).toMatchObject({ online: false, boxesTotal: 120, palletsTotal: 3 });
  });
});
