import type { Alarm, AlarmSeverity, CellState, WaitingReason } from '@logicflows/contract';

export const HOUR_MS = 3_600_000;

/**
 * En qué se fue cada segundo de una hora (docs/indicadores-de-planta.md).
 * `WAITING` se separa por su motivo; `NO_DATA` es la célula desconectada o
 * sin ningún estado conocido.
 */
export type TimeBucket = Exclude<CellState, 'WAITING'> | `WAITING_${WaitingReason}` | 'NO_DATA';

/**
 * Causa de una parada: el estado, el motivo de la espera o, en un fallo, el
 * código de la alarma que lo provocó (`FAULT:ROB-001`).
 */
export type StopCause =
  'STARTING' | 'PAUSED' | 'STARVED' | 'BLOCKED' | 'EMERGENCY_STOP' | `FAULT:${string}`;

export interface StopTotals {
  readonly seconds: number;
  /** Veces que la parada empezó dentro de la hora. */
  readonly count: number;
}

/** Un cambio de estado de la célula (mensaje `state`). */
export interface StatePoint {
  readonly at: number;
  readonly state: CellState;
  readonly waitingReason: WaitingReason | null;
  readonly activeAlarms: readonly Alarm[];
}

/** Un cambio de conexión de la célula (mensaje `status`). */
export interface StatusPoint {
  readonly at: number;
  readonly online: boolean;
}

export interface HourInput {
  readonly hourStart: number;
  /**
   * Cambios de estado ordenados por tiempo: el último anterior a la hora, si
   * lo hay, y todos los de dentro de la hora.
   */
  readonly states: readonly StatePoint[];
  /** Igual que `states`, para la conexión. */
  readonly statuses: readonly StatusPoint[];
  readonly boxes: number;
  readonly pallets: number;
  /**
   * Hasta dónde se resume, si la hora no ha terminado: el resto todavía no ha
   * ocurrido y no se atribuye a ninguna situación.
   */
  readonly until?: number;
}

export interface HourSummary {
  readonly boxes: number;
  readonly pallets: number;
  readonly seconds: Readonly<Partial<Record<TimeBucket, number>>>;
  readonly stops: Readonly<Partial<Record<StopCause, StopTotals>>>;
  /** Alarmas activadas dentro de la hora, por gravedad. */
  readonly alarms: Readonly<Partial<Record<AlarmSeverity, number>>>;
}

const SEVERITY_RANK: Readonly<Record<AlarmSeverity, number>> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};

/** La alarma que explica un fallo: la más grave y, a igualdad, la primera. */
function faultCode(alarms: readonly Alarm[]): string {
  const [first] = [...alarms].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.raisedAt.localeCompare(b.raisedAt),
  );
  return first?.code ?? 'DESCONOCIDO';
}

const lastAtOrBefore = <T extends { readonly at: number }>(points: readonly T[], t: number) => {
  let found: T | undefined;
  for (const point of points) {
    if (point.at > t) {
      break;
    }
    found = point;
  }
  return found;
};

interface Situation {
  readonly bucket: TimeBucket;
  readonly cause: StopCause | null;
}

/**
 * Situación de la célula en el instante `t`. `faultEntry` es el cambio de
 * estado con el que entró en el fallo en curso, para atribuirlo a su alarma.
 */
function situationAt(t: number, input: HourInput, faultEntry: StatePoint | undefined): Situation {
  const status = lastAtOrBefore(input.statuses, t);
  const state = lastAtOrBefore(input.states, t);
  if (state === undefined || status?.online === false) {
    return { bucket: 'NO_DATA', cause: null };
  }
  switch (state.state) {
    case 'WAITING': {
      const reason = state.waitingReason ?? 'STARVED';
      return { bucket: `WAITING_${reason}`, cause: reason };
    }
    case 'FAULT':
      return {
        bucket: 'FAULT',
        cause: `FAULT:${faultCode((faultEntry ?? state).activeAlarms)}`,
      };
    case 'STARTING':
    case 'PAUSED':
    case 'EMERGENCY_STOP':
      return { bucket: state.state, cause: state.state };
    case 'STOPPED':
    case 'RUNNING':
      return { bucket: state.state, cause: null };
  }
}

/**
 * Resume una hora de una célula: segundos por situación, paradas por causa y
 * alarmas activadas (LF-79, ADR-0016). Una parada que ya venía de la hora
 * anterior suma sus segundos pero no cuenta como una nueva.
 */
export function summarizeHour(input: HourInput): HourSummary {
  const start = input.hourStart;
  const end = Math.max(start, Math.min(start + HOUR_MS, input.until ?? Number.POSITIVE_INFINITY));
  const breakpoints = [
    ...new Set([
      start,
      ...input.states.map((point) => point.at),
      ...input.statuses.map((point) => point.at),
    ]),
  ]
    .filter((t) => t >= start && t < end)
    .sort((a, b) => a - b);

  const seconds: Partial<Record<TimeBucket, number>> = {};
  const stops: Partial<Record<StopCause, { seconds: number; count: number }>> = {};

  // El fallo en curso al empezar la hora se atribuye a la alarma con la que entró.
  let faultEntry: StatePoint | undefined;
  let previousState: CellState | undefined;
  for (const point of input.states) {
    if (point.at > start) {
      break;
    }
    if (point.state === 'FAULT' && previousState !== 'FAULT') {
      faultEntry = point;
    }
    previousState = point.state;
  }

  let previousCause: StopCause | null = situationAt(start - 1, input, faultEntry).cause;
  breakpoints.forEach((t, index) => {
    const state = input.states.find((point) => point.at === t);
    if (state?.state === 'FAULT' && lastAtOrBefore(input.states, t - 1)?.state !== 'FAULT') {
      faultEntry = state;
    }
    const situation = situationAt(t, input, faultEntry);
    const until = breakpoints[index + 1] ?? end;
    const duration = (until - t) / 1000;
    seconds[situation.bucket] = (seconds[situation.bucket] ?? 0) + duration;
    if (situation.cause !== null) {
      const totals = (stops[situation.cause] ??= { seconds: 0, count: 0 });
      totals.seconds += duration;
      if (situation.cause !== previousCause) {
        totals.count += 1;
      }
    }
    previousCause = situation.cause;
  });

  const alarms: Partial<Record<AlarmSeverity, number>> = {};
  const seen = new Set<string>();
  for (const point of input.states) {
    for (const alarm of point.activeAlarms) {
      const raised = Date.parse(alarm.raisedAt);
      const key = `${alarm.code}@${alarm.raisedAt}`;
      if (raised >= start && raised < end && !seen.has(key)) {
        seen.add(key);
        alarms[alarm.severity] = (alarms[alarm.severity] ?? 0) + 1;
      }
    }
  }

  return { boxes: input.boxes, pallets: input.pallets, seconds, stops, alarms };
}
