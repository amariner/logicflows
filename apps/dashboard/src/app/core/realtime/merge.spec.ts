import type { CellSnapshot } from '@logicflows/contract';
import { buildStateMessage, buildTelemetryMessage, testUuid } from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { isNewer, mergeCell } from './merge';

const cell = (overrides: Partial<CellSnapshot>): CellSnapshot => ({
  siteId: 'demo',
  cellId: 'cell-01',
  status: null,
  state: null,
  telemetry: null,
  ...overrides,
});

describe('fusión de la información de una célula', () => {
  it('en la misma sesión manda la secuencia', () => {
    const older = buildTelemetryMessage({ seq: 5, timestamp: '2026-10-05T09:00:00.000Z' });
    const newer = buildTelemetryMessage({ seq: 6, timestamp: '2026-10-05T08:00:00.000Z' });
    expect(isNewer(newer, older)).toBe(true);
    expect(isNewer(older, newer)).toBe(false);
  });

  it('entre sesiones manda la marca de tiempo', () => {
    const before = buildStateMessage({ seq: 90, timestamp: '2026-10-05T08:00:00.000Z' });
    const restarted = buildStateMessage({
      seq: 0,
      sessionId: testUuid(2),
      timestamp: '2026-10-05T09:00:00.000Z',
    });
    expect(isNewer(restarted, before)).toBe(true);
  });

  it('un mensaje repetido no se considera más reciente', () => {
    const message = buildStateMessage({ seq: 3 });
    expect(isNewer(message, message)).toBe(false);
  });

  it('conserva el mensaje más reciente de cada tipo por separado', () => {
    const current = cell({
      state: buildStateMessage({ seq: 10, state: 'FAULT' }),
      telemetry: buildTelemetryMessage({ seq: 3, boxesTotal: 30 }),
    });
    // Una respuesta que llega tarde: estado antiguo pero telemetría nueva.
    const late = cell({
      state: buildStateMessage({ seq: 9, state: 'RUNNING' }),
      telemetry: buildTelemetryMessage({ seq: 4, boxesTotal: 31 }),
    });
    const merged = mergeCell(current, late);
    expect(merged.state?.state).toBe('FAULT');
    expect(merged.telemetry?.boxesTotal).toBe(31);
  });

  it('no pierde lo que ya sabía cuando el mensaje nuevo no lo trae', () => {
    const current = cell({ state: buildStateMessage({ seq: 1 }) });
    expect(mergeCell(current, cell({})).state).toEqual(current.state);
  });
});
