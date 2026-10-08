import type { CalendarVersion, Shift, SiteCalendar } from './calendar.types';

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const hour = (value: number) => `${String(value).padStart(2, '0')}:00`;

/** «Mañana · 06:00–14:00»; si cruza la medianoche, «Noche · 22:00–06:00 del día siguiente». */
export const formatShift = (shift: Shift): string =>
  `${shift.name} · ${hour(shift.start)}–${hour(shift.end)}${shift.end <= shift.start ? ' del día siguiente' : ''}`;

/** «lunes, 12 de octubre de 2026», de una fecha `YYYY-MM-DD`. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export interface WeekdayView {
  readonly weekday: string;
  /** Los turnos que empiezan ese día, en orden; vacío si no hay turnos. */
  readonly shifts: readonly string[];
}

export interface VersionView {
  readonly effectiveFrom: string;
  /** «Vigente desde el lunes, 12 de octubre de 2026» o «Desde el …». */
  readonly title: string;
  readonly current: boolean;
  readonly timeZone: string;
  readonly days: readonly WeekdayView[];
  /** Solo las futuras se pueden borrar (ADR-0021). */
  readonly removable: boolean;
  readonly author: string;
}

export interface ExceptionView {
  readonly date: string;
  readonly label: string;
  readonly name: string;
  readonly past: boolean;
  readonly removable: boolean;
}

export interface CalendarView {
  readonly versions: readonly VersionView[];
  readonly exceptions: readonly ExceptionView[];
  /** Sin calendario, los indicadores tratan todas las horas como fuera de turno. */
  readonly empty: boolean;
  /** La primera fecha que se puede elegir para un cambio: mañana en la planta. */
  readonly tomorrow: string;
  readonly timeZone: string;
  /** Los turnos de la última versión, para empezar una nueva a partir de ella. */
  readonly latestShifts: readonly Shift[];
}

function versionView(version: CalendarVersion, calendar: SiteCalendar): VersionView {
  const current = version.effectiveFrom === calendar.current;
  return {
    effectiveFrom: version.effectiveFrom,
    title: `${current ? 'Vigente desde' : 'Desde'} el ${formatDate(version.effectiveFrom)}`,
    current,
    timeZone: version.timeZone,
    days: WEEKDAYS.map((weekday, index) => ({
      weekday,
      shifts: version.shifts
        .filter((shift) => shift.weekday === index + 1)
        .sort((a, b) => a.start - b.start)
        .map(formatShift),
    })),
    removable: version.effectiveFrom > calendar.today,
    author: `Creada por ${version.createdBy}`,
  };
}

/** El día siguiente a una fecha `YYYY-MM-DD`. */
export const nextDay = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function toCalendarView(calendar: SiteCalendar): CalendarView {
  const latest = calendar.versions.at(-1);
  return {
    versions: calendar.versions.map((version) => versionView(version, calendar)),
    exceptions: calendar.exceptions.map((exception) => ({
      date: exception.date,
      label: formatDate(exception.date),
      name: exception.name,
      past: exception.date <= calendar.today,
      removable: exception.date > calendar.today,
    })),
    empty: calendar.versions.length === 0,
    tomorrow: nextDay(calendar.today),
    timeZone: latest?.timeZone ?? 'Europe/Madrid',
    latestShifts: latest?.shifts ?? [],
  };
}
