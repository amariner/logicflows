import type { Resolution } from './history.types';

/** Periodos que ofrece el visor. */
export type PeriodChoice = 'today' | 'week' | 'month';

export interface HistoryQuery {
  readonly from: string;
  readonly to: string;
  readonly resolution: Resolution;
  readonly timeZone: string;
}

const HOUR_MS = 3_600_000;
/** Más que el día más largo: si no se encuentra una medianoche, la zona no sirve. */
const MAX_STEPS = 48;

const isMidnight = (instant: number, timeZone: string): boolean =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant) === '00:00';

/** La medianoche local más cercana en la dirección indicada, o null. */
function findMidnight(from: number, step: number, timeZone: string): number | null {
  let instant = from;
  for (let steps = 0; steps < MAX_STEPS; steps++, instant += step) {
    if (isMidnight(instant, timeZone)) {
      return instant;
    }
  }
  return null;
}

/** Retrocede `days` medianoches locales. */
function daysBefore(midnight: number, days: number, timeZone: string): number | null {
  let instant: number | null = midnight;
  for (let day = 0; day < days && instant !== null; day++) {
    instant = findMidnight(instant - HOUR_MS, -HOUR_MS, timeZone);
  }
  return instant;
}

/** La zona horaria del dispositivo. */
export const deviceTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Consulta del histórico para un periodo, en horas en punto y con los días
 * de la zona horaria indicada:
 * - Hoy: por horas, desde la medianoche hasta la hora en curso incluida.
 * - 7 y 30 días: por días, hasta el día en curso incluido.
 * Si la zona no tiene desfases de horas enteras, se usa UTC.
 */
export function periodQuery(choice: PeriodChoice, now: Date, timeZone: string): HistoryQuery {
  const hour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const today = findMidnight(hour, -HOUR_MS, timeZone);
  const tomorrow = findMidnight(hour + HOUR_MS, HOUR_MS, timeZone);
  if (today === null || tomorrow === null) {
    return timeZone === 'UTC' ? fail() : periodQuery(choice, now, 'UTC');
  }
  if (choice === 'today') {
    return query(today, hour + HOUR_MS, 'hour', timeZone);
  }
  const from = daysBefore(tomorrow, choice === 'week' ? 7 : 30, timeZone);
  return from === null ? fail() : query(from, tomorrow, 'day', timeZone);
}

const query = (from: number, to: number, resolution: Resolution, timeZone: string) => ({
  from: new Date(from).toISOString(),
  to: new Date(to).toISOString(),
  resolution,
  timeZone,
});

function fail(): never {
  throw new Error('No se puede calcular el periodo');
}
