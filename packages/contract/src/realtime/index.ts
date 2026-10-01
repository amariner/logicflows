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

/** Última información conocida de una célula. `null` si aún no se ha recibido. */
export interface CellSnapshot {
  readonly siteId: string;
  readonly cellId: string;
  readonly status: StatusMessage | null;
  readonly state: StateMessage | null;
  readonly telemetry: TelemetryMessage | null;
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
