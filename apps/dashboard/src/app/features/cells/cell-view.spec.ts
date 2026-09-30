import type { CellSnapshot } from '@logicflows/contract';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
} from '@logicflows/contract/testing';
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
      boxesLabel: '—',
      palletsTotal: null,
      palletLabel: 'Sin datos de producción',
    });
  });

  it('traduce cada estado de ADR-0003', () => {
    expect(Object.keys(STATE_LABELS)).toHaveLength(7);
    expect(STATE_LABELS.EMERGENCY_STOP).toBe('Parada de emergencia');
  });

  it('añade la causa de la espera', () => {
    const state = buildStateMessage({ state: 'WAITING', waitingReason: 'STARVED' });
    expect(toCellView({ ...empty, state }).stateLabel).toBe('En espera · sin cajas');
  });

  it('muestra la producción con separador de miles y el pallet en curso', () => {
    const telemetry = buildTelemetryMessage({
      boxesTotal: 15234,
      palletsTotal: 1,
      pallet: { currentLayer: 3, layersPerPallet: 5, boxesInLayer: 2, boxesPerLayer: 8 },
    });
    const view = toCellView({ ...empty, telemetry, status: buildStatusMessage({ online: false }) });
    expect(view).toMatchObject({
      online: false,
      boxesTotal: 15234,
      boxesLabel: '15.234',
      palletLabel: '1 pallet · capa 3 de 5',
    });
  });
});
