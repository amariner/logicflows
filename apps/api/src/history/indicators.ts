import type { AlarmSeverity } from '@logicflows/contract';

import { HOUR_MS } from './hour-summary.ts';

/** Agregado de una hora, como se guarda en `cell_hourly`. */
export interface HourRow {
  readonly hour: Date;
  readonly boxes: number;
  readonly pallets: number;
  readonly seconds: Readonly<Partial<Record<string, number>>>;
  readonly stops: Readonly<Partial<Record<string, { seconds: number; count: number }>>>;
  readonly alarms: Readonly<Partial<Record<AlarmSeverity, number>>>;
  readonly computedAt: Date;
}

export type StopKind = 'STARTING' | 'PAUSED' | 'STARVED' | 'BLOCKED' | 'FAULT' | 'EMERGENCY_STOP';

export interface Stop {
  readonly cause: StopKind;
  /** Código de la alarma que provocó el fallo; solo en `FAULT`. */
  readonly alarmCode: string | null;
  readonly seconds: number;
  readonly count: number;
}

/** Indicadores de planta de un periodo (docs/indicadores-de-planta.md). */
export interface Indicators {
  readonly from: string;
  readonly to: string;
  readonly boxes: number;
  readonly pallets: number;
  readonly seconds: {
    /** Tiempo transcurrido del periodo: lo que aún no ha ocurrido no cuenta. */
    readonly total: number;
    readonly noData: number;
    /** `STOPPED`: no se pretendía producir. */
    readonly outOfProduction: number;
    readonly planned: number;
    readonly running: number;
    readonly stopped: number;
  };
  /** En producción ÷ planificado; null si no hubo tiempo planificado. */
  readonly availability: number | null;
  /** Cajas ÷ (en producción × ritmo nominal); null si no hubo producción. */
  readonly performance: number | null;
  /** Paradas por causa, de mayor a menor duración. */
  readonly stops: readonly Stop[];
  /** Alarmas activadas en el periodo, por gravedad. */
  readonly alarms: Readonly<Record<AlarmSeverity, number>>;
}

const STOP_BUCKETS = [
  'STARTING',
  'PAUSED',
  'WAITING_STARVED',
  'WAITING_BLOCKED',
  'FAULT',
  'EMERGENCY_STOP',
] as const;

const SEVERITIES: readonly AlarmSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function stopOf(key: string): Pick<Stop, 'cause' | 'alarmCode'> {
  if (key.startsWith('FAULT:')) {
    return { cause: 'FAULT', alarmCode: key.slice('FAULT:'.length) };
  }
  return { cause: key as StopKind, alarmCode: null };
}

/**
 * Indicadores de [from, to) a partir de los agregados por hora de ese periodo.
 * Una hora sin agregado es tiempo sin datos. De la hora en curso solo cuenta
 * lo ya agregado, y nada de lo que todavía no ha ocurrido.
 */
export function computeIndicators(
  rows: readonly HourRow[],
  from: Date,
  to: Date,
  now: Date,
  nominalBoxesPerHour: number,
): Indicators {
  const byHour = new Map(rows.map((row) => [row.hour.getTime(), row]));
  let totalMs = 0;
  let boxes = 0;
  let pallets = 0;
  const seconds = new Map<string, number>();
  const stops = new Map<string, { seconds: number; count: number }>();
  const alarms: Record<AlarmSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  for (let hour = from.getTime(); hour < to.getTime(); hour += HOUR_MS) {
    const row = byHour.get(hour);
    const end =
      hour + HOUR_MS <= now.getTime() ? hour + HOUR_MS : (row?.computedAt ?? now).getTime();
    totalMs += Math.min(HOUR_MS, Math.max(0, Math.min(end, now.getTime()) - hour));
    if (row === undefined) {
      continue;
    }
    boxes += row.boxes;
    pallets += row.pallets;
    for (const [bucket, value = 0] of Object.entries(row.seconds)) {
      seconds.set(bucket, (seconds.get(bucket) ?? 0) + value);
    }
    for (const [cause, value] of Object.entries(row.stops)) {
      const current = stops.get(cause) ?? { seconds: 0, count: 0 };
      stops.set(cause, {
        seconds: current.seconds + (value?.seconds ?? 0),
        count: current.count + (value?.count ?? 0),
      });
    }
    for (const severity of SEVERITIES) {
      alarms[severity] += row.alarms[severity] ?? 0;
    }
  }

  const total = Math.round(totalMs / 1000);
  const running = seconds.get('RUNNING') ?? 0;
  const outOfProduction = seconds.get('STOPPED') ?? 0;
  const stopped = STOP_BUCKETS.reduce((sum, bucket) => sum + (seconds.get(bucket) ?? 0), 0);
  const planned = running + stopped;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    boxes,
    pallets,
    seconds: {
      total,
      noData: Math.max(0, total - planned - outOfProduction),
      outOfProduction,
      planned,
      running,
      stopped,
    },
    availability: planned > 0 ? running / planned : null,
    performance: running > 0 ? boxes / ((running / 3600) * nominalBoxesPerHour) : null,
    stops: [...stops.entries()]
      .map(([key, value]) => ({ ...stopOf(key), ...value }))
      .sort((a, b) => b.seconds - a.seconds || b.count - a.count),
    alarms,
  };
}
