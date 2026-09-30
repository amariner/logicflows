import { messageSchemas } from '@logicflows/contract';
import { testUuid } from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { ALARMS } from './domain/alarms.ts';
import { PalletizingCell } from './domain/cell.ts';
import { componentStates } from './domain/components.ts';
import { MessageFactory } from './messages.ts';

const setup = () => {
  let id = 0;
  const factory = new MessageFactory({
    siteId: 'demo',
    cellId: 'cell-01',
    sessionId: testUuid(1),
    newId: () => testUuid(100 + id++),
  });
  const cell = new PalletizingCell({ layersPerPallet: 5, boxesPerLayer: 8 }, 0);
  return { factory, cell };
};

describe('mensajes del simulador', () => {
  it('construye mensajes válidos según el contrato', () => {
    const { factory, cell } = setup();
    cell.apply('start', 0);
    cell.apply('started', 1_000);
    cell.processBox(2_000);

    const status = factory.status(true, 2_000);
    const state = factory.state(cell.status, [], 2_000);
    const telemetry = factory.telemetry(
      cell.production(2_000),
      cell.format,
      componentStates(cell.status),
      2_000,
    );

    expect(messageSchemas.status.parse(status)).toEqual(status);
    expect(messageSchemas.state.parse(state)).toEqual(state);
    expect(messageSchemas.telemetry.parse(telemetry)).toEqual(telemetry);
    expect(telemetry).toMatchObject({
      boxesTotal: 1,
      pallet: { currentLayer: 1, boxesInLayer: 1, boxesPerLayer: 8, layersPerPallet: 5 },
      robot: { state: 'MOVING' },
      timestamp: '1970-01-01T00:00:02.000Z',
    });
  });

  it('lleva una secuencia independiente para state y telemetry', () => {
    const { factory, cell } = setup();
    const production = cell.production(0);
    const components = componentStates(cell.status);
    expect(factory.state(cell.status, [], 0).seq).toBe(0);
    expect(factory.state(cell.status, [], 0).seq).toBe(1);
    expect(factory.telemetry(production, cell.format, components, 0).seq).toBe(0);
    expect(factory.state(cell.status, [], 0).seq).toBe(2);
  });

  it('incluye las alarmas activas y marca las actualizaciones que solo cambian alarmas', () => {
    const { factory, cell } = setup();
    const alarms = [{ ...ALARMS.emergencyStop, raisedAtMs: 1_000 }];
    const message = factory.state(cell.status, alarms, 2_000, true);
    expect(messageSchemas.state.parse(message)).toEqual(message);
    expect(message).toMatchObject({
      event: null,
      activeAlarms: [
        {
          code: 'SAF-001',
          severity: 'CRITICAL',
          message: 'Parada de emergencia activada',
          raisedAt: '1970-01-01T00:00:01.000Z',
        },
      ],
    });
  });

  it('usa un identificador distinto en cada mensaje y la misma sesión', () => {
    const { factory } = setup();
    const first = factory.status(true, 0);
    const second = factory.status(true, 0);
    expect(first.messageId).not.toBe(second.messageId);
    expect(first.sessionId).toBe(second.sessionId);
  });

  it('publica en los topics de su célula', () => {
    expect(setup().factory.topic('telemetry')).toBe('logicflows/v1/demo/cell-01/telemetry');
  });
});
