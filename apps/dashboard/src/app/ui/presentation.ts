import type { AlarmSeverity, CellState, WaitingReason } from '@logicflows/contract';

/** Tono visual de un estado o una alarma (docs/diseno-del-visor.md). */
export type Tone = 'ok' | 'info' | 'neutral' | 'warning' | 'danger';

export interface StatePresentation {
  readonly label: string;
  readonly icon: string;
  readonly tone: Tone;
  /** El estado requiere atención: se destaca la tarjeta. */
  readonly attention: boolean;
}

/** Presentación de cada estado de ADR-0003: texto, icono y tono. */
export const STATE_PRESENTATION: Readonly<Record<CellState, StatePresentation>> = {
  RUNNING: { label: 'Produciendo', icon: 'play-sharp', tone: 'ok', attention: false },
  STARTING: { label: 'Arrancando', icon: 'sync-sharp', tone: 'info', attention: false },
  STOPPED: { label: 'Detenida', icon: 'stop-sharp', tone: 'neutral', attention: false },
  PAUSED: { label: 'En pausa', icon: 'pause-sharp', tone: 'neutral', attention: false },
  WAITING: { label: 'En espera', icon: 'hourglass-sharp', tone: 'warning', attention: true },
  FAULT: { label: 'Fallo', icon: 'warning-sharp', tone: 'danger', attention: true },
  EMERGENCY_STOP: {
    label: 'Parada de emergencia',
    icon: 'hand-left-sharp',
    tone: 'danger',
    attention: true,
  },
};

export const WAITING_REASON_LABELS: Readonly<Record<WaitingReason, string>> = {
  STARVED: 'sin cajas',
  BLOCKED: 'salida ocupada',
};

export interface SeverityPresentation {
  readonly label: string;
  readonly icon: string;
  readonly tone: Tone;
  /** Orden de gravedad: menor es más grave. */
  readonly rank: number;
}

export const SEVERITY_PRESENTATION: Readonly<Record<AlarmSeverity, SeverityPresentation>> = {
  CRITICAL: { label: 'Crítica', icon: 'hand-left-sharp', tone: 'danger', rank: 0 },
  HIGH: { label: 'Alta', icon: 'warning-sharp', tone: 'danger', rank: 1 },
  MEDIUM: { label: 'Media', icon: 'warning-sharp', tone: 'warning', rank: 2 },
  LOW: { label: 'Baja', icon: 'information-circle-sharp', tone: 'info', rank: 3 },
};

export const ROBOT_LABELS = { IDLE: 'parado', MOVING: 'en movimiento', FAULT: 'averiado' } as const;
export const CONVEYOR_LABELS = {
  STOPPED: 'parada',
  RUNNING: 'en marcha',
  FAULT: 'averiada',
} as const;
