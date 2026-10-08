import { describe, expect, it } from 'vitest';

import { formatShift, nextDay, toCalendarView } from './calendar-view';
import type { SiteCalendar } from './calendar.types';

const calendar: SiteCalendar = {
  siteId: 'demo',
  today: '2026-10-14',
  current: '2026-10-12',
  versions: [
    {
      effectiveFrom: '2026-10-12',
      timeZone: 'Europe/Madrid',
      shifts: [
        { weekday: 1, start: 14, end: 22, name: 'Tarde' },
        { weekday: 1, start: 6, end: 14, name: 'Mañana' },
      ],
      createdBy: 'logicflows',
      createdAt: '2026-10-08T08:57:58.000Z',
    },
    {
      effectiveFrom: '2026-10-19',
      timeZone: 'Europe/Madrid',
      shifts: [{ weekday: 5, start: 22, end: 6, name: 'Noche' }],
      createdBy: 'jefa.planta',
      createdAt: '2026-10-14T10:00:00.000Z',
    },
  ],
  exceptions: [
    { date: '2026-10-12', name: 'Fiesta Nacional', createdBy: 'x', createdAt: '' },
    { date: '2026-11-02', name: 'Mantenimiento', createdBy: 'x', createdAt: '' },
  ],
};

describe('calendario de turnos (LF-127)', () => {
  it('muestra los turnos de cada día en orden, y los que cruzan la medianoche', () => {
    const view = toCalendarView(calendar);
    expect(view.versions[0]).toMatchObject({
      title: 'Vigente desde el lunes, 12 de octubre de 2026',
      current: true,
      removable: false,
      author: 'Creada por logicflows',
    });
    expect(view.versions[0]?.days[0]).toEqual({
      weekday: 'Lunes',
      shifts: ['Mañana · 06:00–14:00', 'Tarde · 14:00–22:00'],
    });
    expect(view.versions[0]?.days[6]).toEqual({ weekday: 'Domingo', shifts: [] });
    expect(formatShift({ weekday: 5, start: 22, end: 6, name: 'Noche' })).toBe(
      'Noche · 22:00–06:00 del día siguiente',
    );
  });

  it('solo deja borrar versiones y excepciones futuras (ADR-0021)', () => {
    const view = toCalendarView(calendar);
    expect(view.versions.map((version) => version.removable)).toEqual([false, true]);
    expect(view.versions[1]?.title).toBe('Desde el lunes, 19 de octubre de 2026');
    expect(view.exceptions.map((exception) => [exception.name, exception.removable])).toEqual([
      ['Fiesta Nacional', false],
      ['Mantenimiento', true],
    ]);
  });

  it('el primer día que se puede cambiar es mañana en la planta', () => {
    expect(toCalendarView(calendar).tomorrow).toBe('2026-10-15');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });

  it('sin calendario, lo dice', () => {
    const view = toCalendarView({ ...calendar, current: null, versions: [], exceptions: [] });
    expect(view.empty).toBe(true);
    expect(view.latestShifts).toEqual([]);
  });
});
