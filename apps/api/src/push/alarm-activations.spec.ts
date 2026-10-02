import { buildStateMessage } from '@logicflows/contract/testing';
import type { Alarm } from '@logicflows/contract';
import { describe, expect, it } from 'vitest';

import {
  EMERGENCY_STOP_CODE,
  MAX_NOTIFICATION_AGE_MS,
  activationsToNotify,
  isRecent,
  notificationFor,
} from './alarm-activations.ts';

const alarm = (code: string, severity: Alarm['severity']): Alarm => ({
  code,
  severity,
  message: `Texto de ${code}`,
  raisedAt: '2026-10-05T08:00:00.000Z',
});

describe('activaciones que avisan en el móvil (ADR-0015)', () => {
  it('avisan las alarmas críticas y altas, no las medias ni las bajas', () => {
    const message = buildStateMessage({
      state: 'FAULT',
      activeAlarms: [
        alarm('ROB-001', 'HIGH'),
        alarm('CONV-002', 'MEDIUM'),
        alarm('CONV-001', 'LOW'),
        alarm('SAF-001', 'CRITICAL'),
      ],
    });
    expect(activationsToNotify(message).map((a) => [a.code, a.severity])).toEqual([
      ['ROB-001', 'HIGH'],
      ['SAF-001', 'CRITICAL'],
    ]);
  });

  it('una activación es la célula, el código y el momento en que se activó', () => {
    const message = buildStateMessage({ state: 'FAULT', activeAlarms: [alarm('ROB-001', 'HIGH')] });
    expect(activationsToNotify(message)).toEqual([
      {
        siteId: message.siteId,
        cellId: message.cellId,
        code: 'ROB-001',
        raisedAt: '2026-10-05T08:00:00.000Z',
        severity: 'HIGH',
      },
    ]);
  });

  it('la parada de emergencia avisa aunque la célula no informe de ninguna alarma', () => {
    const message = buildStateMessage({
      state: 'EMERGENCY_STOP',
      since: '2026-10-05T09:00:00.000Z',
      activeAlarms: [],
    });
    expect(activationsToNotify(message)).toEqual([
      expect.objectContaining({
        code: EMERGENCY_STOP_CODE,
        raisedAt: '2026-10-05T09:00:00.000Z',
        severity: 'CRITICAL',
      }),
    ]);
  });

  it('si la parada ya trae su alarma crítica, no avisa dos veces', () => {
    const message = buildStateMessage({
      state: 'EMERGENCY_STOP',
      activeAlarms: [alarm('SAF-001', 'CRITICAL')],
    });
    expect(activationsToNotify(message).map((a) => a.code)).toEqual(['SAF-001']);
  });

  it('sin alarmas graves no avisa', () => {
    expect(activationsToNotify(buildStateMessage({ state: 'RUNNING', activeAlarms: [] }))).toEqual(
      [],
    );
  });

  it('el aviso lleva la gravedad y la célula, nunca el texto de la alarma', () => {
    const [activation] = activationsToNotify(
      buildStateMessage({ state: 'FAULT', activeAlarms: [alarm('ROB-001', 'HIGH')] }),
    );
    if (activation === undefined) {
      throw new Error('Se esperaba una activación');
    }
    const notification = notificationFor(activation);
    expect(notification).toEqual({
      title: 'Alarma alta en LogicFlows',
      body: `${activation.siteId} / ${activation.cellId}`,
      data: { siteId: activation.siteId, cellId: activation.cellId },
      collapseKey: `${activation.siteId}/${activation.cellId}`,
    });
    expect(JSON.stringify(notification)).not.toContain('Texto de ROB-001');
  });

  it('una activación antigua, como las de un histórico cargado, no avisa', () => {
    const [activation] = activationsToNotify(
      buildStateMessage({ state: 'FAULT', activeAlarms: [alarm('ROB-001', 'HIGH')] }),
    );
    if (activation === undefined) {
      throw new Error('Se esperaba una activación');
    }
    const raisedAt = Date.parse(activation.raisedAt);
    expect(isRecent(activation, raisedAt + MAX_NOTIFICATION_AGE_MS)).toBe(true);
    expect(isRecent(activation, raisedAt + MAX_NOTIFICATION_AGE_MS + 1)).toBe(false);
  });
});
