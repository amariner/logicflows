import type {
  Alarm,
  AlarmSeverity,
  CellEvent,
  CellState,
  WaitingReason,
} from '@logicflows/contract';

/** Resolución del histórico: por horas o por días. */
export type Resolution = 'hour' | 'day';

export type StopCause = 'STARTING' | 'PAUSED' | 'STARVED' | 'BLOCKED' | 'FAULT' | 'EMERGENCY_STOP';

/** Indicadores de un periodo, como los devuelve la API (LF-80). */
export interface PeriodIndicators {
  readonly from: string;
  readonly to: string;
  readonly boxes: number;
  readonly pallets: number;
  readonly seconds: {
    readonly total: number;
    readonly noData: number;
    readonly outOfProduction: number;
    readonly planned: number;
    readonly running: number;
    readonly stopped: number;
  };
  readonly availability: number | null;
  readonly performance: number | null;
  readonly stops: readonly {
    readonly cause: StopCause;
    readonly alarmCode: string | null;
    readonly seconds: number;
    readonly count: number;
  }[];
  readonly alarms: Readonly<Record<AlarmSeverity, number>>;
}

/** Respuesta de `GET /api/v1/sites/{siteId}/cells/{cellId}/history`. */
export interface CellHistory {
  readonly siteId: string;
  readonly cellId: string;
  readonly from: string;
  readonly to: string;
  readonly resolution: Resolution;
  readonly timeZone: string;
  readonly nominalBoxesPerHour: number;
  readonly summary: PeriodIndicators;
  readonly periods: readonly PeriodIndicators[];
}

/** Un cambio de estado o de conexión, como lo devuelve la API (LF-84). */
export interface CellEventDto {
  readonly kind: 'state' | 'connection';
  readonly at: string;
  readonly state: CellState | null;
  readonly previousState: CellState | null;
  readonly event: CellEvent | null;
  readonly waitingReason: WaitingReason | null;
  readonly alarms: readonly Alarm[];
  readonly online: boolean | null;
  readonly durationSeconds: number | null;
}

/** Respuesta de `GET /api/v1/sites/{siteId}/cells/{cellId}/events`. */
export interface CellEvents {
  readonly from: string;
  readonly to: string;
  readonly truncated: boolean;
  readonly events: readonly CellEventDto[];
}
