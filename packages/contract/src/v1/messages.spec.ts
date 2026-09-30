import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildStateMessage, buildStatusMessage, buildTelemetryMessage } from '../testing/index.js';
import { messageSchemas, stateMessageSchema, telemetryMessageSchema } from './messages.js';

const adr = readFileSync(
  new URL('../../../../docs/adr/0004-mensajes-de-telemetria-y-topics-mqtt.md', import.meta.url),
  'utf8',
);
const adrExamples = [...adr.matchAll(/```json\n([\s\S]*?)```/g)].map(
  (match) => JSON.parse(match[1] ?? '') as unknown,
);

describe('mensajes', () => {
  it('los ejemplos de ADR-0004 cumplen el contrato', () => {
    expect(adrExamples).toHaveLength(3);
    const [status, state, telemetry] = adrExamples;
    expect(messageSchemas.status.safeParse(status).success).toBe(true);
    expect(messageSchemas.state.safeParse(state).success).toBe(true);
    expect(messageSchemas.telemetry.safeParse(telemetry).success).toBe(true);
  });

  it('los constructores de pruebas generan mensajes válidos', () => {
    expect(messageSchemas.status.safeParse(buildStatusMessage()).success).toBe(true);
    expect(messageSchemas.state.safeParse(buildStateMessage()).success).toBe(true);
    expect(messageSchemas.telemetry.safeParse(buildTelemetryMessage()).success).toBe(true);
  });

  describe('compatibilidad', () => {
    it('acepta versiones posteriores del esquema e ignora los campos desconocidos', () => {
      const result = stateMessageSchema.safeParse({
        ...buildStateMessage(),
        schemaVersion: 2,
        operatorId: 'op-7',
      });
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('operatorId');
    });

    it('rechaza un schemaVersion menor que 1', () => {
      expect(stateMessageSchema.safeParse(buildStateMessage({ schemaVersion: 0 })).success).toBe(
        false,
      );
    });
  });

  describe('campos comunes', () => {
    it.each([
      ['un messageId que no es UUID v7', { messageId: '9b2d3c1e-1f2a-4b3c-8d4e-5f6a7b8c9d0e' }],
      ['una marca de tiempo con zona horaria', { timestamp: '2026-10-05T10:30:00.000+02:00' }],
      ['una marca de tiempo sin milisegundos', { timestamp: '2026-10-05T08:30:00Z' }],
      ['una célula con mayúsculas', { cellId: 'Cell-01' }],
      ['una secuencia negativa', { seq: -1 }],
    ])('rechaza %s', (_case, overrides) => {
      expect(stateMessageSchema.safeParse({ ...buildStateMessage(), ...overrides }).success).toBe(
        false,
      );
    });
  });

  describe('state', () => {
    it('exige la causa de la espera en WAITING', () => {
      const waiting = buildStateMessage({ state: 'WAITING', waitingReason: null });
      expect(stateMessageSchema.safeParse(waiting).success).toBe(false);
      expect(stateMessageSchema.safeParse({ ...waiting, waitingReason: 'STARVED' }).success).toBe(
        true,
      );
    });

    it('rechaza una causa de espera fuera de WAITING', () => {
      expect(
        stateMessageSchema.safeParse(
          buildStateMessage({ state: 'RUNNING', waitingReason: 'BLOCKED' }),
        ).success,
      ).toBe(false);
    });

    it('admite el primer mensaje de una sesión, sin estado anterior ni evento', () => {
      const first = buildStateMessage({ state: 'STOPPED', previousState: null, event: null });
      expect(stateMessageSchema.safeParse(first).success).toBe(true);
    });

    it('rechaza un estado desconocido y una alarma con severidad desconocida', () => {
      expect(stateMessageSchema.safeParse({ ...buildStateMessage(), state: 'IDLE' }).success).toBe(
        false,
      );
      const alarm = {
        code: 'CONV-001',
        severity: 'URGENT',
        message: 'Sin cajas',
        raisedAt: '2026-10-05T08:30:00.000Z',
      };
      expect(
        stateMessageSchema.safeParse({ ...buildStateMessage(), activeAlarms: [alarm] }).success,
      ).toBe(false);
    });
  });

  describe('telemetry', () => {
    it.each([
      ['un contador negativo', { boxesTotal: -1 }],
      ['un contador no entero', { palletsTotal: 1.5 }],
      ['un ritmo negativo', { throughputBoxesPerHour: -10 }],
      [
        'una capa en curso mayor que las capas del pallet',
        { pallet: { currentLayer: 6, layersPerPallet: 5, boxesInLayer: 0, boxesPerLayer: 8 } },
      ],
      [
        'más cajas en la capa de las que caben',
        { pallet: { currentLayer: 1, layersPerPallet: 5, boxesInLayer: 9, boxesPerLayer: 8 } },
      ],
      ['un estado de robot desconocido', { robot: { state: 'PICKING' } }],
    ])('rechaza %s', (_case, overrides) => {
      expect(
        telemetryMessageSchema.safeParse({ ...buildTelemetryMessage(), ...overrides }).success,
      ).toBe(false);
    });

    it('admite la ausencia de tiempo de ciclo antes del primer ciclo completo', () => {
      expect(
        telemetryMessageSchema.safeParse(buildTelemetryMessage({ cycleTimeMs: null })).success,
      ).toBe(true);
    });
  });
});
