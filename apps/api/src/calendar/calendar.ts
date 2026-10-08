/**
 * Calendario de turnos de una planta (ADR-0021): versiones con fecha de
 * entrada en vigor, turnos semanales en horas en punto y excepciones por día.
 * Responde si una hora del histórico es tiempo de turno.
 */

/** Día de la semana ISO 8601: 1 es lunes y 7 es domingo. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Un turno semanal: empieza el día `weekday` a la hora `start` y termina a la
 * hora `end`. Si `end` es menor o igual que `start`, cruza la medianoche y
 * termina el día siguiente: 22 → 6 es de 22:00 a 06:00.
 */
export interface Shift {
  readonly weekday: Weekday;
  readonly start: number;
  readonly end: number;
  readonly name: string;
}

/** Una versión del calendario, vigente desde su fecha hasta la siguiente. */
export interface CalendarVersion {
  /** Fecha local de entrada en vigor, `YYYY-MM-DD`. */
  readonly effectiveFrom: string;
  /** Zona horaria IANA de las horas de los turnos. */
  readonly timeZone: string;
  readonly shifts: readonly Shift[];
}

/** Un día sin turnos: festivo, vacaciones o parada por mantenimiento. */
export interface CalendarException {
  /** Fecha local, `YYYY-MM-DD`. */
  readonly date: string;
  readonly name: string;
}

const DAY_MS = 86_400_000;
const HOURS_PER_WEEK = 168;

/** Horas de la semana que ocupa un turno, como índices de 0 (lunes 00:00) a 167. */
function weekHours(shift: Shift): number[] {
  const first = (shift.weekday - 1) * 24 + shift.start;
  const length = shift.end > shift.start ? shift.end - shift.start : 24 - shift.start + shift.end;
  return Array.from({ length }, (_, offset) => (first + offset) % HOURS_PER_WEEK);
}

/**
 * Problemas de los turnos de una versión: horas fuera de rango y solapes.
 * Una lista vacía significa que son válidos.
 */
export function shiftProblems(shifts: readonly Shift[]): string[] {
  const problems: string[] = [];
  const owner = new Map<number, Shift>();
  for (const shift of shifts) {
    if (shift.start === shift.end) {
      problems.push(`El turno «${shift.name}» empieza y termina a la misma hora`);
      continue;
    }
    for (const hour of weekHours(shift)) {
      const other = owner.get(hour);
      if (other !== undefined) {
        problems.push(`Los turnos «${other.name}» y «${shift.name}» se solapan`);
        break;
      }
      owner.set(hour, shift);
    }
  }
  return [...new Set(problems)];
}

/** Fecha, hora y día de la semana locales de un instante en una zona horaria. */
export function localTime(
  instant: Date,
  timeZone: string,
): { date: string; hour: number; weekday: Weekday } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')),
    weekday: (weekdays.indexOf(part('weekday')) + 1) as Weekday,
  };
}

/** El día anterior a una fecha `YYYY-MM-DD`. */
export function previousDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** El día local de un instante en una zona horaria, `YYYY-MM-DD`. */
export const localDate = (instant: Date, timeZone: string): string =>
  localTime(instant, timeZone).date;

/**
 * Calendario completo de una planta, con todas sus versiones y excepciones,
 * para decidir hora a hora si es tiempo de turno.
 */
export class ShiftCalendar {
  /** Versiones de la más antigua a la más reciente. */
  readonly #versions: readonly CalendarVersion[];
  readonly #exceptions: ReadonlySet<string>;
  /**
   * Por versión, para cada hora de la semana, cuántos días antes empezó el
   * turno que la cubre (0 o 1), o nada si no es de turno.
   */
  readonly #startOffsets: ReadonlyMap<CalendarVersion, ReadonlyMap<number, number>>;

  constructor(versions: readonly CalendarVersion[], exceptions: readonly CalendarException[]) {
    this.#versions = [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    this.#exceptions = new Set(exceptions.map((exception) => exception.date));
    this.#startOffsets = new Map(
      this.#versions.map((version) => {
        const offsets = new Map<number, number>();
        for (const shift of version.shifts) {
          const startDay = shift.weekday - 1;
          for (const hour of weekHours(shift)) {
            offsets.set(hour, Math.floor(hour / 24) === startDay ? 0 : 1);
          }
        }
        return [version, offsets];
      }),
    );
  }

  /** Si la planta tiene alguna versión del calendario. */
  get empty(): boolean {
    return this.#versions.length === 0;
  }

  /** La versión vigente en una fecha local, si la hay. */
  versionOn(date: string): CalendarVersion | undefined {
    let found: CalendarVersion | undefined;
    for (const version of this.#versions) {
      if (version.effectiveFrom <= date) {
        found = version;
      }
    }
    return found;
  }

  /**
   * Si la hora que empieza en `hour` es tiempo de turno. El turno cuenta según
   * la versión y las excepciones del día en que empezó: la noche del lunes al
   * martes es del lunes, aunque el martes sea festivo.
   */
  isShiftHour(hour: Date): boolean {
    for (const version of this.#versions) {
      const local = localTime(hour, version.timeZone);
      const offset = this.#startOffsets.get(version)?.get((local.weekday - 1) * 24 + local.hour);
      if (offset === undefined) {
        continue;
      }
      const startDate = offset === 0 ? local.date : previousDay(local.date);
      if (this.versionOn(startDate) === version && !this.#exceptions.has(startDate)) {
        return true;
      }
    }
    return false;
  }
}
