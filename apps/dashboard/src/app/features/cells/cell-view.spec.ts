import type { CellSnapshot } from '@logicflows/contract';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
} from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { toCellView } from './cell-view';
import { STATE_PRESENTATION } from './presentation';

const empty: CellSnapshot = {
  siteId: 'demo',
  cellId: 'cell-01',
  status: null,
  state: null,
  telemetry: null,
};
const time = (iso: string) => iso.slice(11, 16);

describe('vista de una célula', () => {
  it('muestra una célula de la que aún no hay datos', () => {
    expect(toCellView(empty, time)).toMatchObject({
      online: null,
      state: null,
      stateLabel: 'Sin datos',
      stateTone: 'neutral',
      attention: false,
      alarms: [],
      boxesLabel: '—',
      palletLabel: 'Sin datos de producción',
      componentsLabel: null,
    });
  });

  it('presenta cada estado de ADR-0003 con texto, icono y tono', () => {
    expect(Object.keys(STATE_PRESENTATION)).toHaveLength(7);
    for (const presentation of Object.values(STATE_PRESENTATION)) {
      expect(presentation.label).not.toBe('');
      expect(presentation.icon).toMatch(/-sharp$/);
    }
  });

  it.each([
    ['RUNNING', 'Produciendo', 'ok', false],
    ['STOPPED', 'Detenida', 'neutral', false],
    ['FAULT', 'Fallo', 'danger', true],
    ['EMERGENCY_STOP', 'Parada de emergencia', 'danger', true],
  ] as const)('%s: «%s», tono %s, atención %s', (state, label, tone, attention) => {
    const view = toCellView({ ...empty, state: buildStateMessage({ state }) }, time);
    expect(view).toMatchObject({ stateLabel: label, stateTone: tone, attention });
  });

  it('añade la causa de la espera', () => {
    const state = buildStateMessage({ state: 'WAITING', waitingReason: 'BLOCKED' });
    expect(toCellView({ ...empty, state }, time)).toMatchObject({
      stateLabel: 'En espera · salida ocupada',
      stateTone: 'warning',
      attention: true,
    });
  });

  it('ordena las alarmas de más a menos grave y muestra desde cuándo', () => {
    const state = buildStateMessage({
      state: 'EMERGENCY_STOP',
      activeAlarms: [
        {
          code: 'CONV-002',
          severity: 'MEDIUM',
          message: 'Atasco',
          raisedAt: '2026-10-05T08:10:00.000Z',
        },
        {
          code: 'SAF-001',
          severity: 'CRITICAL',
          message: 'Parada',
          raisedAt: '2026-10-05T08:12:00.000Z',
        },
      ],
    });
    const { alarms } = toCellView({ ...empty, state }, time);
    expect(alarms).toEqual([
      {
        code: 'SAF-001',
        message: 'Parada',
        severityLabel: 'Crítica',
        icon: 'hand-left-sharp',
        tone: 'danger',
        sinceLabel: 'desde las 08:12',
      },
      expect.objectContaining({ code: 'CONV-002', severityLabel: 'Media', tone: 'warning' }),
    ]);
  });

  it('muestra la producción y el estado del robot y de la cinta', () => {
    const telemetry = buildTelemetryMessage({
      boxesTotal: 15234,
      palletsTotal: 1,
      pallet: { currentLayer: 3, layersPerPallet: 5, boxesInLayer: 2, boxesPerLayer: 8 },
      robot: { state: 'FAULT' },
      conveyor: { state: 'STOPPED' },
    });
    const view = toCellView(
      { ...empty, telemetry, status: buildStatusMessage({ online: false }) },
      time,
    );
    expect(view).toMatchObject({
      online: false,
      boxesLabel: '15.234',
      palletLabel: '1 pallet · capa 3 de 5',
      componentsLabel: 'Robot: averiado · Cinta: parada',
    });
  });
});
