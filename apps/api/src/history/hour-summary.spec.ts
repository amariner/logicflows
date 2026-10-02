import type { Alarm, CellState, WaitingReason } from '@logicflows/contract';
import { describe, expect, it } from 'vitest';

import { HOUR_MS, summarizeHour } from './hour-summary.ts';
import type { StatePoint, StatusPoint } from './hour-summary.ts';

const H = Date.parse('2026-10-05T08:00:00.000Z');
const min = (m: number) => H + m * 60_000;

const alarm = (code: string, severity: Alarm['severity'], at: number): Alarm => ({
  code,
  severity,
  message: code,
  raisedAt: new Date(at).toISOString(),
});

const state = (
  at: number,
  value: CellState,
  options: { reason?: WaitingReason; alarms?: Alarm[] } = {},
): StatePoint => ({
  at,
  state: value,
  waitingReason: value === 'WAITING' ? (options.reason ?? 'STARVED') : null,
  activeAlarms: options.alarms ?? [],
});

const online = (at: number, value = true): StatusPoint => ({ at, online: value });

describe('resumen de una hora de una célula (LF-79)', () => {
  it('reparte los segundos de la hora por situación y cuenta las paradas por causa', () => {
    const rob = alarm('ROB-001', 'HIGH', min(20));
    const summary = summarizeHour({
      hourStart: H,
      states: [
        state(H - 60_000, 'STOPPED'),
        state(min(5), 'STARTING'),
        state(min(7), 'RUNNING'),
        state(min(20), 'FAULT', { alarms: [rob] }),
        state(min(30), 'STOPPED'),
        state(min(31), 'STARTING'),
        state(min(32), 'RUNNING'),
        state(min(40), 'WAITING', { reason: 'STARVED' }),
        state(min(44), 'RUNNING'),
        state(min(50), 'PAUSED'),
        state(min(53), 'RUNNING'),
      ],
      statuses: [online(H - 3_600_000)],
      boxes: 400,
      pallets: 10,
    });
    expect(summary.seconds).toEqual({
      STOPPED: 6 * 60,
      STARTING: 3 * 60,
      RUNNING: (13 + 8 + 6 + 7) * 60,
      FAULT: 10 * 60,
      WAITING_STARVED: 4 * 60,
      PAUSED: 3 * 60,
    });
    expect(Object.values(summary.seconds).reduce((a, b) => a + b, 0)).toBe(HOUR_MS / 1000);
    expect(summary.stops).toEqual({
      STARTING: { seconds: 180, count: 2 },
      'FAULT:ROB-001': { seconds: 600, count: 1 },
      STARVED: { seconds: 240, count: 1 },
      PAUSED: { seconds: 180, count: 1 },
    });
    expect(summary.alarms).toEqual({ HIGH: 1 });
    expect(summary).toMatchObject({ boxes: 400, pallets: 10 });
  });

  it('una parada que viene de la hora anterior suma segundos pero no cuenta como nueva', () => {
    const rob = alarm('ROB-002', 'HIGH', H - 5 * 60_000);
    const summary = summarizeHour({
      hourStart: H,
      states: [state(H - 5 * 60_000, 'FAULT', { alarms: [rob] }), state(min(10), 'STOPPED')],
      statuses: [],
      boxes: 0,
      pallets: 0,
    });
    expect(summary.stops).toEqual({ 'FAULT:ROB-002': { seconds: 600, count: 0 } });
    // La alarma se activó en la hora anterior.
    expect(summary.alarms).toEqual({});
  });

  it('el fallo se atribuye a la alarma más grave con la que entró, aunque después cambien las alarmas', () => {
    const conveyor = alarm('CONV-002', 'MEDIUM', min(1));
    const robot = alarm('ROB-001', 'HIGH', min(1));
    const later = alarm('SAF-001', 'CRITICAL', min(5));
    const summary = summarizeHour({
      hourStart: H,
      states: [
        state(H - 1, 'RUNNING'),
        state(min(1), 'FAULT', { alarms: [conveyor, robot] }),
        state(min(5), 'FAULT', { alarms: [conveyor, robot, later] }),
        state(min(10), 'STOPPED'),
      ],
      statuses: [],
      boxes: 0,
      pallets: 0,
    });
    expect(summary.stops).toEqual({ 'FAULT:ROB-001': { seconds: 540, count: 1 } });
    expect(summary.alarms).toEqual({ MEDIUM: 1, HIGH: 1, CRITICAL: 1 });
  });

  it('el tiempo desconectado o sin ningún estado conocido es «sin datos»', () => {
    const summary = summarizeHour({
      hourStart: H,
      states: [state(min(10), 'RUNNING')],
      statuses: [online(min(10)), online(min(40), false), online(min(50))],
      boxes: 0,
      pallets: 0,
    });
    expect(summary.seconds).toEqual({ NO_DATA: (10 + 10) * 60, RUNNING: (30 + 10) * 60 });
    expect(summary.stops).toEqual({});
  });

  it('separa las esperas por su motivo', () => {
    const summary = summarizeHour({
      hourStart: H,
      states: [
        state(H - 1, 'RUNNING'),
        state(min(10), 'WAITING', { reason: 'BLOCKED' }),
        state(min(15), 'WAITING', { reason: 'STARVED' }),
        state(min(20), 'RUNNING'),
      ],
      statuses: [],
      boxes: 0,
      pallets: 0,
    });
    expect(summary.seconds).toMatchObject({ WAITING_BLOCKED: 300, WAITING_STARVED: 300 });
    expect(summary.stops).toEqual({
      BLOCKED: { seconds: 300, count: 1 },
      STARVED: { seconds: 300, count: 1 },
    });
  });
});
