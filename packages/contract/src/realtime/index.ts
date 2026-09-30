/**
 * Mensajes del canal de tiempo real entre la API y el visor (ADR-0006).
 * La API los envía por WebSocket en JSON.
 */
import type { StateMessage, StatusMessage, TelemetryMessage } from '../v1/messages.ts';

/** Ruta del WebSocket de la API. */
export const REALTIME_PATH = '/realtime';

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
