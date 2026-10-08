/**
 * Mensajes del canal de tiempo real entre la API y el visor (ADR-0006).
 * La API los envía por WebSocket en JSON.
 */
import type { StateMessage, StatusMessage, TelemetryMessage } from '../v1/messages.ts';

/** Ruta del WebSocket de la API. */
export const REALTIME_PATH = '/realtime';

/** Ruta REST, bajo `/api/v1`, que entrega los tiques para conectar (ADR-0009). */
export const REALTIME_TICKETS_PATH = '/realtime/tickets';

/**
 * Código de cierre cuando la conexión no está autorizada: falta el tique, no
 * es válido o ha caducado el token con el que se obtuvo. El visor pide un
 * tique nuevo y vuelve a conectar (ADR-0009).
 */
export const REALTIME_UNAUTHORIZED_CLOSE_CODE = 4401;

/**
 * Reconocimiento de una alarma activa (ADR-0022): una persona dice «la he
 * visto y me ocupo». La alarma sigue activa hasta que la célula la resuelve.
 */
export interface AlarmAcknowledgement {
  /** La activación reconocida: código y momento en que se activó. */
  readonly code: string;
  readonly raisedAt: string;
  /** Nombre de usuario de quien la reconoció. */
  readonly acknowledgedBy: string;
  /** Hora del servidor, ISO 8601. */
  readonly acknowledgedAt: string;
}

/** Última información conocida de una célula. `null` si aún no se ha recibido. */
export interface CellSnapshot {
  readonly siteId: string;
  readonly cellId: string;
  readonly status: StatusMessage | null;
  readonly state: StateMessage | null;
  readonly telemetry: TelemetryMessage | null;
  /**
   * Reconocimientos de las alarmas activas (ADR-0022). Ausente en una API
   * anterior: equivale a ninguno.
   */
  readonly acknowledgements?: readonly AlarmAcknowledgement[];
}

/** Al conectar: la información de todas las células conocidas. */
export interface SnapshotMessage {
  readonly type: 'snapshot';
  readonly cells: readonly CellSnapshot[];
}

/** En cada cambio: la información actualizada de una célula. */
export interface CellUpdateMessage {
  readonly type: 'cell';
  readonly cell: CellSnapshot;
}

export type RealtimeMessage = SnapshotMessage | CellUpdateMessage;
