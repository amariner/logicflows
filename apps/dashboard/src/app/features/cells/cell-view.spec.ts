import type { CellSnapshot } from '@logicflows/contract';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
} from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { toCellView } from './cell-view';
import { STATE_PRESENTATION } from '../../ui/presentation';

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
      indicators: { boxes: '—', layer: '—' },
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
        raisedAt: '2026-10-05T08:12:00.000Z',
        message: 'Parada',
        severityLabel: 'Crítica',
        icon: 'hand-left-sharp',
        tone: 'danger',
        sinceLabel: 'desde las 08:12',
        acknowledgedLabel: null,
      },
      expect.objectContaining({ code: 'CONV-002', severityLabel: 'Media', tone: 'warning' }),
    ]);
  });

  it('dice quién reconoció una alarma y cuándo (ADR-0022)', () => {
    const raisedAt = '2026-10-05T08:12:00.000Z';
    const state = buildStateMessage({
      state: 'FAULT',
      activeAlarms: [{ code: 'ROB-001', severity: 'HIGH', message: 'Colisión', raisedAt }],
    });
    const { alarms } = toCellView(
      {
        ...empty,
        state,
        acknowledgements: [
          {
            code: 'ROB-001',
            raisedAt,
            acknowledgedBy: 'operaria',
            acknowledgedAt: '2026-10-05T08:14:00.000Z',
          },
          // De otra activación: no cuenta.
          {
            code: 'ROB-001',
            raisedAt: '2026-10-05T07:00:00.000Z',
            acknowledgedBy: 'otro',
            acknowledgedAt: '2026-10-05T07:01:00.000Z',
          },
        ],
      },
      time,
    );
    expect(alarms[0]?.acknowledgedLabel).toBe('Reconocida por operaria a las 08:14');
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
      boxesTotal: 15234,
      indicators: { boxes: '15.234', pallets: '1', layer: '3 de 5' },
      componentsLabel: 'Robot: averiado · Cinta: parada',
    });
  });
});
