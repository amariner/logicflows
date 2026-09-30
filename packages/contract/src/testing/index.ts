/**
 * Constructores de mensajes válidos para pruebas. Cada función devuelve un
 * mensaje que cumple el contrato y permite sobrescribir solo los campos
 * relevantes para cada caso.
 */
import { CURRENT_SCHEMA_VERSION } from '../v1/messages.ts';
import type { StateMessage, StatusMessage, TelemetryMessage } from '../v1/messages.ts';

export const TEST_SITE_ID = 'demo';
export const TEST_CELL_ID = 'cell-01';
export const TEST_SESSION_ID = '0199a1b2-7c00-7000-8000-000000000001';
export const TEST_TIMESTAMP = '2026-10-05T08:30:00.000Z';

/** UUID v7 determinista para pruebas a partir de un número. */
export function testUuid(n: number): string {
  return `0199a1b2-7c00-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

const envelope = (n: number) => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  messageId: testUuid(1000 + n),
  siteId: TEST_SITE_ID,
  cellId: TEST_CELL_ID,
  sessionId: TEST_SESSION_ID,
  timestamp: TEST_TIMESTAMP,
});

export function buildStatusMessage(overrides: Partial<StatusMessage> = {}): StatusMessage {
  return { ...envelope(0), online: true, ...overrides };
}

export function buildStateMessage(overrides: Partial<StateMessage> = {}): StateMessage {
  return {
    ...envelope(1),
    seq: 1,
    state: 'RUNNING',
    previousState: 'STARTING',
    event: 'started',
    waitingReason: null,
    since: TEST_TIMESTAMP,
    activeAlarms: [],
    ...overrides,
  };
}

export function buildTelemetryMessage(overrides: Partial<TelemetryMessage> = {}): TelemetryMessage {
  return {
    ...envelope(2),
    seq: 1,
    boxesTotal: 120,
    palletsTotal: 3,
    pallet: { currentLayer: 1, layersPerPallet: 5, boxesInLayer: 0, boxesPerLayer: 8 },
    cycleTimeMs: 4200,
    throughputBoxesPerHour: 820,
    robot: { state: 'MOVING' },
    conveyor: { state: 'RUNNING' },
    ...overrides,
  };
}
