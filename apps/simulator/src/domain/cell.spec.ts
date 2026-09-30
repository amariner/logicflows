import { describe, expect, it } from 'vitest';

import { PalletizingCell } from './cell.ts';
import { ALARMS } from './alarms.ts';
import { componentStates } from './components.ts';

const format = { layersPerPallet: 5, boxesPerLayer: 8 };

const runningCell = () => {
  const cell = new PalletizingCell(format, 0);
  cell.apply('start', 0);
  cell.apply('started', 3_000);
  return cell;
};

describe('célula de paletizado', () => {
  it('arranca detenida', () => {
    expect(new PalletizingCell(format, 0).status).toEqual({
      state: 'STOPPED',
      previousState: null,
      event: null,
      waitingReason: null,
      sinceMs: 0,
    });
  });

  it('sigue la secuencia de arranque de ADR-0003', () => {
    const cell = runningCell();
    expect(cell.status).toMatchObject({
      state: 'RUNNING',
      previousState: 'STARTING',
      event: 'started',
      sinceMs: 3_000,
    });
  });

  it('rechaza los eventos no previstos en el estado actual', () => {
    const cell = new PalletizingCell(format, 0);
    expect(() => cell.apply('started', 0)).toThrow('no está previsto');
    expect(cell.accepts('resume')).toBe(false);
    expect(cell.status.state).toBe('STOPPED');
  });

  it('registra la causa de la espera', () => {
    const cell = runningCell();
    expect(cell.apply('starved', 5_000)).toMatchObject({
      state: 'WAITING',
      waitingReason: 'STARVED',
    });
    expect(cell.apply('supplyRestored', 6_000).waitingReason).toBeNull();
  });

  it('elige el destino del rearme de una parada de emergencia', () => {
    const cell = runningCell();
    cell.apply('emergencyStop', 5_000);
    expect(cell.apply('reset', 6_000, 'FAULT').state).toBe('FAULT');
    expect(() => cell.apply('reset', 7_000, 'RUNNING')).toThrow('no está previsto');
  });

  it('paletiza cajas solo mientras produce', () => {
    const cell = new PalletizingCell(format, 0);
    expect(() => cell.processBox(0)).toThrow('No se puede paletizar');
  });

  it('mide el tiempo de ciclo entre cajas consecutivas y el ritmo', () => {
    const cell = runningCell();
    expect(cell.processBox(4_000).cycleTimeMs).toBeNull();
    const production = cell.processBox(8_200);
    expect(production).toMatchObject({ boxesTotal: 2, cycleTimeMs: 4_200 });
    expect(production.throughputBoxesPerHour).toBe(120);
  });
});

describe('estado de los componentes', () => {
  it.each([
    ['STARTING', null, 'MOVING', 'STOPPED'],
    ['RUNNING', null, 'MOVING', 'RUNNING'],
    ['WAITING', 'STARVED', 'IDLE', 'RUNNING'],
    ['WAITING', 'BLOCKED', 'IDLE', 'STOPPED'],
    ['PAUSED', null, 'IDLE', 'STOPPED'],
    ['EMERGENCY_STOP', null, 'IDLE', 'STOPPED'],
    ['STOPPED', null, 'IDLE', 'STOPPED'],
  ] as const)('en %s (%s): robot %s y cinta %s', (state, waitingReason, robot, conveyor) => {
    const status = { state, waitingReason, previousState: null, event: null, sinceMs: 0 };
    expect(componentStates(status)).toEqual({ robot, conveyor });
  });
  it.each([
    ['sin alarmas', [], 'IDLE', 'STOPPED'],
    ['un fallo del robot', [ALARMS.robotCollision], 'FAULT', 'STOPPED'],
    ['un atasco de la cinta', [ALARMS.conveyorJam], 'IDLE', 'FAULT'],
  ] as const)('en FAULT con %s: robot %s y cinta %s', (_case, alarms, robot, conveyor) => {
    const status = {
      state: 'FAULT',
      waitingReason: null,
      previousState: null,
      event: null,
      sinceMs: 0,
    } as const;
    const active = alarms.map((alarm) => ({ ...alarm, raisedAtMs: 0 }));
    expect(componentStates(status, active)).toEqual({ robot, conveyor });
  });
});

describe('alarmas de la célula', () => {
  it('conserva el momento en que se activó una alarma repetida', () => {
    const cell = new PalletizingCell(format, 0);
    cell.raiseAlarm(ALARMS.conveyorJam, 1_000);
    cell.raiseAlarm(ALARMS.conveyorJam, 2_000);
    expect(cell.alarms).toEqual([{ ...ALARMS.conveyorJam, raisedAtMs: 1_000 }]);
  });

  it('distingue los fallos de la célula de las esperas externas', () => {
    const cell = new PalletizingCell(format, 0);
    cell.raiseAlarm(ALARMS.starved, 0);
    expect(cell.hasActiveFault()).toBe(false);
    cell.raiseAlarm(ALARMS.gripperVacuumLoss, 0);
    expect(cell.hasActiveFault()).toBe(true);
    cell.clearAlarmsFrom('robot');
    expect(cell.alarms.map((alarm) => alarm.code)).toEqual(['CONV-001']);
  });
});
