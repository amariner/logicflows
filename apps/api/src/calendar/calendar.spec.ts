import { describe, expect, it } from 'vitest';

import { localTime, previousDay, ShiftCalendar, shiftProblems } from './calendar.ts';
import type { CalendarVersion, Shift } from './calendar.ts';

const MADRID = 'Europe/Madrid';
const HOUR_MS = 3_600_000;

/** Turnos de mañana y tarde de lunes a viernes, como la demo. */
const weekdays = (start: number, end: number, name: string): Shift[] =>
  ([1, 2, 3, 4, 5] as const).map((weekday) => ({ weekday, start, end, name }));
const demo: CalendarVersion = {
  effectiveFrom: '2026-10-12',
  timeZone: MADRID,
  shifts: [...weekdays(6, 14, 'Mañana'), ...weekdays(14, 22, 'Tarde')],
};

/** Horas de turno entre dos instantes, contando hora a hora. */
function shiftHours(calendar: ShiftCalendar, from: string, to: string): number {
  let count = 0;
  for (let t = Date.parse(from); t < Date.parse(to); t += HOUR_MS) {
    if (calendar.isShiftHour(new Date(t))) count++;
  }
  return count;
}

describe('turnos de una versión (ADR-0021)', () => {
  it('acepta turnos que no se solapan, también los que cruzan la medianoche', () => {
    expect(
      shiftProblems([
        { weekday: 1, start: 6, end: 14, name: 'Mañana' },
        { weekday: 1, start: 22, end: 6, name: 'Noche' },
        { weekday: 2, start: 6, end: 14, name: 'Mañana' },
      ]),
    ).toEqual([]);
  });

  it('detecta un solape dentro del mismo día', () => {
    expect(
      shiftProblems([
        { weekday: 1, start: 6, end: 14, name: 'Mañana' },
        { weekday: 1, start: 13, end: 21, name: 'Tarde' },
      ]),
    ).toEqual(['Los turnos «Mañana» y «Tarde» se solapan']);
  });

  it('detecta el solape de una noche con el turno del día siguiente', () => {
    expect(
      shiftProblems([
        { weekday: 7, start: 22, end: 7, name: 'Noche del domingo' },
        { weekday: 1, start: 6, end: 14, name: 'Mañana del lunes' },
      ]),
    ).toEqual(['Los turnos «Noche del domingo» y «Mañana del lunes» se solapan']);
  });

  it('rechaza un turno que empieza y termina a la misma hora', () => {
    expect(shiftProblems([{ weekday: 3, start: 8, end: 8, name: 'Raro' }])).toEqual([
      'El turno «Raro» empieza y termina a la misma hora',
    ]);
  });
});

describe('horas de turno', () => {
  it('sin calendario, ninguna hora es de turno', () => {
    const calendar = new ShiftCalendar([], []);
    expect(calendar.empty).toBe(true);
    expect(calendar.isShiftHour(new Date('2026-10-13T08:00:00Z'))).toBe(false);
  });

  it('cuenta las horas de los turnos en la hora local de la planta', () => {
    const calendar = new ShiftCalendar([demo], []);
    // Martes 13 de octubre, horario de verano (UTC+2): 06:00 local son las 04:00 UTC.
    expect(calendar.isShiftHour(new Date('2026-10-13T03:00:00Z'))).toBe(false);
    expect(calendar.isShiftHour(new Date('2026-10-13T04:00:00Z'))).toBe(true);
    expect(calendar.isShiftHour(new Date('2026-10-13T19:00:00Z'))).toBe(true);
    expect(calendar.isShiftHour(new Date('2026-10-13T20:00:00Z'))).toBe(false);
    expect(shiftHours(calendar, '2026-10-12T22:00:00Z', '2026-10-13T22:00:00Z')).toBe(16);
  });

  it('el fin de semana no tiene turnos', () => {
    const calendar = new ShiftCalendar([demo], []);
    expect(shiftHours(calendar, '2026-10-16T22:00:00Z', '2026-10-18T22:00:00Z')).toBe(0);
  });

  it('nada es de turno antes de la primera versión', () => {
    const calendar = new ShiftCalendar([demo], []);
    // El viernes 9 es anterior al 12, la entrada en vigor.
    expect(shiftHours(calendar, '2026-10-08T22:00:00Z', '2026-10-09T22:00:00Z')).toBe(0);
  });

  it('un turno de noche pertenece al día en que empieza', () => {
    const night: CalendarVersion = {
      effectiveFrom: '2026-10-12',
      timeZone: MADRID,
      shifts: [{ weekday: 1, start: 22, end: 6, name: 'Noche' }],
    };
    const calendar = new ShiftCalendar([night], []);
    // Del lunes 12 a las 22:00 al martes 13 a las 06:00, hora local.
    expect(calendar.isShiftHour(new Date('2026-10-12T20:00:00Z'))).toBe(true);
    expect(calendar.isShiftHour(new Date('2026-10-13T03:00:00Z'))).toBe(true);
    expect(calendar.isShiftHour(new Date('2026-10-13T04:00:00Z'))).toBe(false);
    expect(shiftHours(calendar, '2026-10-12T00:00:00Z', '2026-10-14T00:00:00Z')).toBe(8);

    // Si el martes es festivo, la noche del lunes sigue contando; si lo es el lunes, no.
    const tuesdayOff = new ShiftCalendar([night], [{ date: '2026-10-13', name: 'Festivo' }]);
    expect(shiftHours(tuesdayOff, '2026-10-12T00:00:00Z', '2026-10-14T00:00:00Z')).toBe(8);
    const mondayOff = new ShiftCalendar([night], [{ date: '2026-10-12', name: 'Festivo' }]);
    expect(shiftHours(mondayOff, '2026-10-12T00:00:00Z', '2026-10-14T00:00:00Z')).toBe(0);
  });

  it('un día de excepción no tiene turnos', () => {
    const calendar = new ShiftCalendar([demo], [{ date: '2026-10-14', name: 'Mantenimiento' }]);
    expect(shiftHours(calendar, '2026-10-13T22:00:00Z', '2026-10-14T22:00:00Z')).toBe(0);
    expect(shiftHours(calendar, '2026-10-14T22:00:00Z', '2026-10-15T22:00:00Z')).toBe(16);
  });

  it('cada día usa la versión vigente: una versión nueva no cambia los días anteriores', () => {
    const later: CalendarVersion = {
      effectiveFrom: '2026-10-19',
      timeZone: MADRID,
      shifts: weekdays(6, 14, 'Mañana'),
    };
    const calendar = new ShiftCalendar([later, demo], []);
    expect(calendar.versionOn('2026-10-16')).toBe(demo);
    expect(calendar.versionOn('2026-10-19')).toBe(later);
    expect(shiftHours(calendar, '2026-10-15T22:00:00Z', '2026-10-16T22:00:00Z')).toBe(16);
    expect(shiftHours(calendar, '2026-10-18T22:00:00Z', '2026-10-19T22:00:00Z')).toBe(8);
  });

  it('la noche en que se retrasa la hora dura 9 horas y la noche en que se adelanta, 7', () => {
    const nights: CalendarVersion = {
      effectiveFrom: '2026-01-01',
      timeZone: MADRID,
      shifts: ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({
        weekday,
        start: 22,
        end: 6,
        name: 'Noche',
      })),
    };
    const calendar = new ShiftCalendar([nights], []);
    // Del sábado 24 al domingo 25 de octubre de 2026: a las 03:00 vuelven a ser las 02:00.
    expect(shiftHours(calendar, '2026-10-24T18:00:00Z', '2026-10-25T07:00:00Z')).toBe(9);
    // Del sábado 28 al domingo 29 de marzo de 2026: a las 02:00 son las 03:00.
    expect(shiftHours(calendar, '2026-03-28T19:00:00Z', '2026-03-29T06:00:00Z')).toBe(7);
  });
});

describe('fechas locales', () => {
  it('da la fecha, la hora y el día de la semana en la zona horaria', () => {
    expect(localTime(new Date('2026-10-12T22:30:00Z'), MADRID)).toEqual({
      date: '2026-10-13',
      hour: 0,
      weekday: 2,
    });
  });

  it('calcula el día anterior, también entre meses y años', () => {
    expect(previousDay('2026-10-13')).toBe('2026-10-12');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
  });
});
