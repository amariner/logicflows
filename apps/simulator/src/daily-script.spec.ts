import { describe, expect, it, vi } from 'vitest';

import { ScriptedIncidents, minuteOfDay, parseTime, validateScript } from './daily-script.ts';
import type { DailyScript } from './daily-script.ts';
import { ALARMS } from './domain/alarms.ts';
import { GUION_DIARIO } from './guion-diario.ts';
import { VirtualClock } from './virtual-clock.ts';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const script: DailyScript = {
  timeZone: 'Europe/Madrid',
  incidents: [
    { at: '09:47', kind: 'fault', alarm: 'ROB-002' },
    { at: '10:30', kind: 'pause', minutes: 15 },
    { at: '11:15', kind: 'emergencyStop' },
    { at: '12:20', kind: 'starved', minutes: 5 },
    { at: '15:25', kind: 'blocked', minutes: 4 },
    { at: '00:00', kind: 'pause', minutes: 1 },
  ],
};

/** Instante del 5 de octubre de 2026 a una hora de Madrid (CEST, UTC+2). */
const madrid = (hhmm: string) => Date.parse(`2026-10-05T${hhmm}:00+02:00`);

const setup = (startMs: number) => {
  const clock = new VirtualClock(startMs);
  const target = {
    fault: vi.fn(() => true),
    emergencyStop: vi.fn(() => true),
    supplyInterruption: vi.fn(() => true),
    pause: vi.fn(() => true),
  };
  const scripted = new ScriptedIncidents({
    target,
    script,
    logger,
    now: clock.now,
    scheduler: clock,
  });
  scripted.start();
  return { clock, target, scripted };
};

describe('guion diario (ADR-0019)', () => {
  it('calcula el minuto del día en la hora local, también con el horario de invierno', () => {
    expect(minuteOfDay(madrid('09:47'), 'Europe/Madrid')).toBe(9 * 60 + 47);
    // 1 de diciembre: CET, UTC+1.
    expect(minuteOfDay(Date.parse('2026-12-01T08:47:00Z'), 'Europe/Madrid')).toBe(9 * 60 + 47);
  });

  it('solo admite horas HH:MM válidas', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('23:59')).toBe(1_439);
    expect(() => parseTime('24:00')).toThrow(/no válida/);
    expect(() => parseTime('9:47')).toThrow(/no válida/);
  });

  it('rechaza un guion con horas repetidas o alarmas fuera del catálogo', () => {
    expect(() => {
      validateScript({
        timeZone: 'Europe/Madrid',
        incidents: [
          { at: '10:00', kind: 'pause', minutes: 5 },
          { at: '10:00', kind: 'emergencyStop' },
        ],
      });
    }).toThrow(/dos incidencias a las 10:00/);
    expect(() => {
      validateScript({
        timeZone: 'Europe/Madrid',
        incidents: [{ at: '10:00', kind: 'fault', alarm: 'XYZ-999' }],
      });
    }).toThrow(/Alarma desconocida/);
  });

  it('el guion de la demo es válido y tiene alarmas graves en horario laboral', () => {
    expect(() => {
      validateScript(GUION_DIARIO);
    }).not.toThrow();
    const graves = GUION_DIARIO.incidents.filter(
      (i) => i.kind === 'emergencyStop' || (i.kind === 'fault' && i.alarm.startsWith('ROB')),
    );
    expect(graves.length).toBeGreaterThanOrEqual(3);
    for (const incident of graves) {
      const minute = parseTime(incident.at);
      expect(minute).toBeGreaterThanOrEqual(9 * 60);
      expect(minute).toBeLessThan(21 * 60);
    }
  });

  it('provoca cada incidencia a su hora, con su duración', () => {
    const { clock, target } = setup(madrid('09:40'));
    clock.runUntil(madrid('16:00'));
    expect(target.fault).toHaveBeenCalledExactlyOnceWith(ALARMS.gripperVacuumLoss);
    expect(target.pause).toHaveBeenCalledExactlyOnceWith(15 * 60_000);
    expect(target.emergencyStop).toHaveBeenCalledOnce();
    expect(target.supplyInterruption).toHaveBeenNthCalledWith(1, 'STARVED', 5 * 60_000);
    expect(target.supplyInterruption).toHaveBeenNthCalledWith(2, 'BLOCKED', 4 * 60_000);
  });

  it('al arrancar no repite lo que ya pasó hoy', () => {
    const { clock, target } = setup(madrid('11:16'));
    clock.runUntil(madrid('12:00'));
    expect(target.fault).not.toHaveBeenCalled();
    expect(target.emergencyStop).not.toHaveBeenCalled();
  });

  it('se repite cada día, también la incidencia de medianoche', () => {
    const { clock, target } = setup(madrid('09:00'));
    clock.runUntil(madrid('09:00') + 2 * 86_400_000);
    expect(target.fault).toHaveBeenCalledTimes(2);
    expect(target.pause).toHaveBeenCalledWith(60_000);
    expect(target.pause).toHaveBeenCalledTimes(4);
  });

  it('si el reloj salta más de cinco minutos, sigue desde ahora sin repetir lo saltado', () => {
    const target = {
      fault: vi.fn(() => true),
      emergencyStop: vi.fn(() => true),
      supplyInterruption: vi.fn(() => true),
      pause: vi.fn(() => true),
    };
    let now = madrid('09:40');
    const scripted = new ScriptedIncidents({ target, script, logger, now: () => now });
    scripted.start();
    now = madrid('11:30');
    scripted.tick();
    scripted.stop();
    expect(target.fault).not.toHaveBeenCalled();
    expect(target.emergencyStop).not.toHaveBeenCalled();
  });
});
