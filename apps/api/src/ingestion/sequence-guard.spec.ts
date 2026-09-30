import { decodeMessage } from '@logicflows/contract';
import type { DecodedMessage } from '@logicflows/contract';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
  testUuid,
} from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { SequenceGuard } from './sequence-guard.ts';

const decode = (kind: 'status' | 'state' | 'telemetry', message: object): DecodedMessage => {
  const result = decodeMessage(`logicflows/v1/demo/cell-01/${kind}`, JSON.stringify(message));
  if (!result.ok) {
    throw new Error(result.detail);
  }
  return result;
};

const state = (seq: number, overrides: object = {}) =>
  decode('state', buildStateMessage({ seq, ...overrides }));

describe('guardia de secuencia (ADR-0004)', () => {
  it('acepta el primer mensaje de cada flujo como una sesión nueva', () => {
    expect(new SequenceGuard().evaluate(state(7))).toEqual({
      accept: true,
      missed: 0,
      newSession: true,
    });
  });

  it('acepta los mensajes consecutivos', () => {
    const guard = new SequenceGuard();
    guard.evaluate(state(1));
    expect(guard.evaluate(state(2))).toEqual({ accept: true, missed: 0, newSession: false });
  });

  it('descarta un duplicado: misma sesión y la misma secuencia', () => {
    const guard = new SequenceGuard();
    guard.evaluate(state(1));
    expect(guard.evaluate(state(1))).toEqual({ accept: false, reason: 'DUPLICATE' });
  });

  it('descarta un mensaje desordenado: misma sesión y una secuencia menor', () => {
    const guard = new SequenceGuard();
    guard.evaluate(state(5));
    expect(guard.evaluate(state(4))).toEqual({ accept: false, reason: 'OUT_OF_ORDER' });
  });

  it('acepta un salto de secuencia e informa de los mensajes perdidos', () => {
    const guard = new SequenceGuard();
    guard.evaluate(state(1));
    expect(guard.evaluate(state(5))).toEqual({ accept: true, missed: 3, newSession: false });
  });

  it('acepta una sesión nueva posterior aunque su secuencia empiece de cero', () => {
    const guard = new SequenceGuard();
    guard.evaluate(state(40, { timestamp: '2026-10-05T08:00:00.000Z' }));
    const restarted = state(0, { sessionId: testUuid(2), timestamp: '2026-10-05T09:00:00.000Z' });
    expect(guard.evaluate(restarted)).toEqual({ accept: true, missed: 0, newSession: true });
  });

  it('descarta un mensaje de una sesión anterior a la actual', () => {
    const guard = new SequenceGuard();
    guard.evaluate(state(0, { sessionId: testUuid(2), timestamp: '2026-10-05T09:00:00.000Z' }));
    const old = state(41, { timestamp: '2026-10-05T08:00:00.000Z' });
    expect(guard.evaluate(old)).toEqual({ accept: false, reason: 'STALE_SESSION' });
  });

  it('lleva una secuencia independiente por tipo de mensaje', () => {
    const guard = new SequenceGuard();
    guard.evaluate(decode('telemetry', buildTelemetryMessage({ seq: 43 })));
    // Una telemetría más reciente no invalida un estado con menor secuencia.
    expect(guard.evaluate(state(42)).accept).toBe(true);
  });

  it('lleva una secuencia independiente por célula', () => {
    const guard = new SequenceGuard();
    guard.evaluate(state(10));
    const otherCell = decodeMessage(
      'logicflows/v1/demo/cell-02/state',
      JSON.stringify(buildStateMessage({ seq: 1, cellId: 'cell-02' })),
    );
    if (!otherCell.ok) {
      throw new Error(otherCell.detail);
    }
    expect(guard.evaluate(otherCell).accept).toBe(true);
  });

  it('acepta siempre los mensajes de conexión, que no llevan secuencia', () => {
    const guard = new SequenceGuard();
    const status = decode('status', buildStatusMessage());
    expect(guard.evaluate(status).accept).toBe(true);
    expect(guard.evaluate(status).accept).toBe(true);
  });
});
