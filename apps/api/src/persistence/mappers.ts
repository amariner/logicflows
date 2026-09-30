import type {
  DecodedMessage,
  StateMessage,
  StatusMessage,
  TelemetryMessage,
} from '@logicflows/contract';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { cellStateChanges, cellStatusEvents, telemetrySamples } from '../database/schema.ts';

type StatusRow = InferSelectModel<typeof cellStatusEvents>;
type StateRow = InferSelectModel<typeof cellStateChanges>;
type TelemetryRow = InferSelectModel<typeof telemetrySamples>;

const envelopeToRow = (
  message: StatusMessage | StateMessage | TelemetryMessage,
  receivedAt: string,
) => ({
  siteId: message.siteId,
  cellId: message.cellId,
  sessionId: message.sessionId,
  messageId: message.messageId,
  schemaVersion: message.schemaVersion,
  sourceTimestamp: new Date(message.timestamp),
  receivedAt: new Date(receivedAt),
});

const rowToEnvelope = (row: StatusRow | StateRow | TelemetryRow) => ({
  schemaVersion: row.schemaVersion,
  messageId: row.messageId,
  siteId: row.siteId,
  cellId: row.cellId,
  sessionId: row.sessionId,
  timestamp: row.sourceTimestamp.toISOString(),
});

export type InsertRow =
  | { readonly kind: 'status'; readonly row: InferInsertModel<typeof cellStatusEvents> }
  | { readonly kind: 'state'; readonly row: InferInsertModel<typeof cellStateChanges> }
  | { readonly kind: 'telemetry'; readonly row: InferInsertModel<typeof telemetrySamples> };

/** Convierte un mensaje aceptado por la ingesta en la fila que se guarda. */
export function toRow(decoded: DecodedMessage, receivedAt: string): InsertRow {
  switch (decoded.kind) {
    case 'status':
      return {
        kind: 'status',
        row: { ...envelopeToRow(decoded.message, receivedAt), online: decoded.message.online },
      };
    case 'state': {
      const message = decoded.message;
      return {
        kind: 'state',
        row: {
          ...envelopeToRow(message, receivedAt),
          seq: message.seq,
          state: message.state,
          previousState: message.previousState,
          event: message.event,
          waitingReason: message.waitingReason,
          since: new Date(message.since),
          activeAlarms: message.activeAlarms,
        },
      };
    }
    case 'telemetry': {
      const message = decoded.message;
      return {
        kind: 'telemetry',
        row: {
          ...envelopeToRow(message, receivedAt),
          seq: message.seq,
          boxesTotal: message.boxesTotal,
          palletsTotal: message.palletsTotal,
          currentLayer: message.pallet.currentLayer,
          layersPerPallet: message.pallet.layersPerPallet,
          boxesInLayer: message.pallet.boxesInLayer,
          boxesPerLayer: message.pallet.boxesPerLayer,
          cycleTimeMs: message.cycleTimeMs,
          throughputBoxesPerHour: message.throughputBoxesPerHour,
          robotState: message.robot.state,
          conveyorState: message.conveyor.state,
        },
      };
    }
  }
}

export const statusFromRow = (row: StatusRow): StatusMessage => ({
  ...rowToEnvelope(row),
  online: row.online,
});

export const stateFromRow = (row: StateRow): StateMessage => ({
  ...rowToEnvelope(row),
  seq: row.seq,
  state: row.state,
  previousState: row.previousState,
  event: row.event,
  waitingReason: row.waitingReason,
  since: row.since.toISOString(),
  activeAlarms: row.activeAlarms,
});

export const telemetryFromRow = (row: TelemetryRow): TelemetryMessage => ({
  ...rowToEnvelope(row),
  seq: row.seq,
  boxesTotal: row.boxesTotal,
  palletsTotal: row.palletsTotal,
  pallet: {
    currentLayer: row.currentLayer,
    layersPerPallet: row.layersPerPallet,
    boxesInLayer: row.boxesInLayer,
    boxesPerLayer: row.boxesPerLayer,
  },
  cycleTimeMs: row.cycleTimeMs,
  throughputBoxesPerHour: row.throughputBoxesPerHour,
  robot: { state: row.robotState },
  conveyor: { state: row.conveyorState },
});
