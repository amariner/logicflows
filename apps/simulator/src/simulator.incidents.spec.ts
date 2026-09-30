import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ALARMS } from './domain/alarms.ts';
import { createTestSimulator } from './testing/simulator.ts';

// Tiempos de TEST_OPTIONS: arranque 2 s, rearme tras un fallo 10 s, tras una
// parada de emergencia 15 s y orden de arranque 3 s después del rearme.
const running = () => {
  const setup = createTestSimulator();
  setup.simulator.start();
  setup.connection.connect();
  vi.advanceTimersByTime(2_000);
  expect(setup.simulator.cell.status.state).toBe('RUNNING');
  return setup;
};

describe('incidencias del simulador (ADR-0003)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-05T08:00:00.000Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fallo', () => {
    it('pasa a FAULT con su alarma y el componente averiado', () => {
      const { simulator, connection } = running();
      expect(simulator.fault(ALARMS.gripperVacuumLoss)).toBe(true);

      expect(connection.ofKind('state').at(-1)).toMatchObject({
        state: 'FAULT',
        event: 'fault',
        activeAlarms: [
          { code: 'ROB-002', severity: 'HIGH', message: 'Pérdida de vacío en la pinza' },
        ],
      });
      expect(connection.ofKind('telemetry').at(-1)).toMatchObject({
        robot: { state: 'FAULT' },
        conveyor: { state: 'STOPPED' },
      });
    });

    it('no paletiza mientras está en fallo', () => {
      const { simulator } = running();
      simulator.fault(ALARMS.conveyorJam);
      const boxes = simulator.cell.production(Date.now()).boxesTotal;
      vi.advanceTimersByTime(9_000);
      expect(simulator.cell.production(Date.now()).boxesTotal).toBe(boxes);
    });

    it('se rearma a STOPPED sin arrancar y el operario da después la orden de arranque', () => {
      const { simulator, connection } = running();
      simulator.fault(ALARMS.robotCollision);

      vi.advanceTimersByTime(10_000);
      expect(connection.ofKind('state').at(-1)).toMatchObject({
        previousState: 'FAULT',
        state: 'STOPPED',
        event: 'reset',
        activeAlarms: [],
      });

      vi.advanceTimersByTime(3_000);
      expect(simulator.cell.status.state).toBe('STARTING');
      vi.advanceTimersByTime(2_000);
      expect(simulator.cell.status.state).toBe('RUNNING');
    });
  });

  describe('parada de emergencia', () => {
    it('se produce desde cualquier estado con una alarma crítica', () => {
      const { simulator, connection } = running();
      simulator.pause(60_000);
      expect(simulator.emergencyStop()).toBe(true);
      expect(connection.ofKind('state').at(-1)).toMatchObject({
        state: 'EMERGENCY_STOP',
        previousState: 'PAUSED',
        activeAlarms: [{ code: 'SAF-001', severity: 'CRITICAL' }],
      });
    });

    it('prevalece sobre un fallo posterior, que solo añade su alarma', () => {
      const { simulator, connection } = running();
      simulator.emergencyStop();
      expect(simulator.fault(ALARMS.conveyorJam)).toBe(true);
      expect(connection.ofKind('state').at(-1)).toMatchObject({
        state: 'EMERGENCY_STOP',
        event: null,
        activeAlarms: [{ code: 'SAF-001' }, { code: 'CONV-002' }],
      });
    });

    it('al rearmarse pasa a FAULT si hay fallos activos', () => {
      const { simulator } = running();
      simulator.emergencyStop();
      simulator.fault(ALARMS.conveyorJam);
      // Fallo resuelto a los 10 s y emergencia a los 15 s: el orden importa.
      vi.advanceTimersByTime(9_999);
      expect(simulator.cell.alarms.map((alarm) => alarm.code)).toEqual(['SAF-001', 'CONV-002']);
      vi.advanceTimersByTime(5_001);
      expect(simulator.cell.status.state).toBe('STOPPED');
    });

    it('va a FAULT al rearmarse si el fallo sigue sin resolver', () => {
      const { simulator } = createTestSimulator({ faultRecoveryMs: 30_000 });
      simulator.start();
      vi.advanceTimersByTime(2_000);
      simulator.emergencyStop();
      simulator.fault(ALARMS.robotCollision);
      vi.advanceTimersByTime(15_000);
      expect(simulator.cell.status).toMatchObject({ state: 'FAULT', event: 'reset' });
      vi.advanceTimersByTime(15_000);
      expect(simulator.cell.status.state).toBe('STOPPED');
    });

    it('nunca vuelve a producir sin pasar por STOPPED y STARTING', () => {
      const { simulator, connection } = running();
      simulator.emergencyStop();
      vi.advanceTimersByTime(15_000 + 3_000 + 2_000);
      const states = connection.ofKind('state').map((message) => message.state);
      const afterEmergency = states.slice(states.lastIndexOf('EMERGENCY_STOP'));
      expect(afterEmergency).toEqual(['EMERGENCY_STOP', 'STOPPED', 'STARTING', 'RUNNING']);
    });
  });

  describe('esperas por causa externa', () => {
    it.each([
      ['STARVED', 'CONV-001', 'RUNNING'],
      ['BLOCKED', 'OUT-001', 'STOPPED'],
    ] as const)('%s: espera con su alarma y reanuda sola', (reason, code, conveyor) => {
      const { simulator, connection } = running();
      expect(simulator.supplyInterruption(reason, 4_000)).toBe(true);
      expect(connection.ofKind('state').at(-1)).toMatchObject({
        state: 'WAITING',
        waitingReason: reason,
        activeAlarms: [{ code, severity: 'LOW' }],
      });
      expect(connection.ofKind('telemetry').at(-1)).toMatchObject({
        conveyor: { state: conveyor },
      });

      vi.advanceTimersByTime(4_000);
      expect(connection.ofKind('state').at(-1)).toMatchObject({
        state: 'RUNNING',
        event: 'supplyRestored',
        activeAlarms: [],
      });
    });

    it('un fallo durante la espera sustituye su alarma', () => {
      const { simulator } = running();
      simulator.supplyInterruption('STARVED', 4_000);
      simulator.fault(ALARMS.robotCollision);
      expect(simulator.cell.alarms.map((alarm) => alarm.code)).toEqual(['ROB-001']);
      vi.advanceTimersByTime(4_000);
      expect(simulator.cell.status.state).toBe('FAULT');
    });
  });

  describe('pausa', () => {
    it('detiene la producción y la reanuda sin repetir el arranque', () => {
      const { simulator, connection } = running();
      simulator.pause(5_000);
      expect(simulator.cell.status.state).toBe('PAUSED');
      vi.advanceTimersByTime(5_000);
      expect(connection.ofKind('state').at(-1)).toMatchObject({
        previousState: 'PAUSED',
        state: 'RUNNING',
        event: 'resume',
      });
    });
  });

  describe('incidencias no previstas', () => {
    it('se rechazan sin cambiar el estado', () => {
      const { simulator, connection } = createTestSimulator();
      simulator.start();
      connection.connect();
      // Durante el arranque no hay producción que interrumpir ni pausar.
      expect(simulator.supplyInterruption('STARVED', 1_000)).toBe(false);
      expect(simulator.pause(1_000)).toBe(false);
      expect(simulator.cell.status.state).toBe('STARTING');
    });

    it('una segunda parada de emergencia se rechaza', () => {
      const { simulator } = running();
      simulator.emergencyStop();
      expect(simulator.emergencyStop()).toBe(false);
    });
  });

  it('cada mensaje de estado cumple el contrato', () => {
    const { simulator, connection } = running();
    simulator.supplyInterruption('BLOCKED', 1_000);
    vi.advanceTimersByTime(1_000);
    simulator.fault(ALARMS.conveyorJam);
    simulator.emergencyStop();
    vi.advanceTimersByTime(60_000);
    // FakeConnection valida con decodeMessage cada mensaje publicado.
    expect(connection.ofKind('state').length).toBeGreaterThan(8);
  });
});
