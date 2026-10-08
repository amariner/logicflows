import type {
  Alarm,
  CellEvent as StateEvent,
  CellState,
  WaitingReason,
} from '@logicflows/contract';

/** Reconocimiento de una alarma en el registro (ADR-0022). */
export interface AcknowledgementEvent {
  readonly code: string;
  readonly raisedAt: string;
  /** Nombre de usuario de quien la reconoció. */
  readonly acknowledgedBy: string;
}

/** Un cambio de estado o de conexión, o un reconocimiento, como se guardó. */
export interface CellEvent {
  readonly kind: 'state' | 'connection' | 'acknowledgement';
  readonly at: Date;
  /** Solo en los cambios de estado. */
  readonly state: CellState | null;
  readonly previousState: CellState | null;
  readonly event: StateEvent | null;
  readonly waitingReason: WaitingReason | null;
  readonly alarms: readonly Alarm[];
  /** Solo en los cambios de conexión. */
  readonly online: boolean | null;
  /** Cuándo empezó el estado siguiente; null si sigue o no se sabe. */
  readonly endedAt: Date | null;
  /** Solo en los reconocimientos. */
  readonly acknowledgement: AcknowledgementEvent | null;
}

/** Evento preparado para la API REST. */
export interface CellEventView {
  readonly kind: 'state' | 'connection' | 'acknowledgement';
  readonly at: string;
  readonly state: CellState | null;
  readonly previousState: CellState | null;
  readonly event: StateEvent | null;
  readonly waitingReason: WaitingReason | null;
  readonly alarms: readonly Alarm[];
  readonly online: boolean | null;
  /** Segundos hasta el estado siguiente; null si es el estado actual. */
  readonly durationSeconds: number | null;
  /** Solo en los reconocimientos (ADR-0022). */
  readonly acknowledgement: AcknowledgementEvent | null;
}

export const toEventView = (event: CellEvent): CellEventView => ({
  kind: event.kind,
  at: event.at.toISOString(),
  state: event.state,
  previousState: event.previousState,
  event: event.event,
  waitingReason: event.waitingReason,
  alarms: event.alarms,
  online: event.online,
  durationSeconds:
    event.endedAt === null
      ? null
      : Math.round((event.endedAt.getTime() - event.at.getTime()) / 1000),
  acknowledgement: event.acknowledgement,
});
