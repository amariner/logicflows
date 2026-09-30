import { z } from 'zod';

import {
  cellIdSchema,
  sequenceSchema,
  siteIdSchema,
  timestampSchema,
  uuidV7Schema,
} from './primitives.ts';
import { cellEventSchema, cellStateSchema, waitingReasonSchema } from './states.ts';
import type { MessageKind } from './topics.ts';

/**
 * Versión del esquema que emiten los publicadores. Todas las versiones de la
 * versión mayor 1 son compatibles: los consumidores aceptan cualquier
 * `schemaVersion` ≥ 1 e ignoran los campos que no conocen (ADR-0004).
 */
export const CURRENT_SCHEMA_VERSION = 1;

// Los esquemas no son estrictos: los campos desconocidos se descartan al
// validar para que un consumidor acepte versiones compatibles posteriores.
const envelope = {
  schemaVersion: z.int().min(1),
  messageId: uuidV7Schema,
  siteId: siteIdSchema,
  cellId: cellIdSchema,
  sessionId: uuidV7Schema,
  timestamp: timestampSchema,
};

export const statusMessageSchema = z.object({
  ...envelope,
  online: z.boolean(),
});
export type StatusMessage = z.infer<typeof statusMessageSchema>;

export const ALARM_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type AlarmSeverity = (typeof ALARM_SEVERITIES)[number];

export const alarmSchema = z.object({
  code: z.string().min(1).max(32),
  severity: z.enum(ALARM_SEVERITIES),
  message: z.string().min(1).max(200),
  raisedAt: timestampSchema,
});
export type Alarm = z.infer<typeof alarmSchema>;

export const stateMessageSchema = z
  .object({
    ...envelope,
    seq: sequenceSchema,
    state: cellStateSchema,
    previousState: cellStateSchema.nullable(),
    event: cellEventSchema.nullable(),
    waitingReason: waitingReasonSchema.nullable(),
    since: timestampSchema,
    activeAlarms: z.array(alarmSchema),
  })
  .refine((message) => (message.state === 'WAITING') === (message.waitingReason !== null), {
    message: 'waitingReason es obligatorio en WAITING y debe ser null en el resto de estados',
    path: ['waitingReason'],
  });
export type StateMessage = z.infer<typeof stateMessageSchema>;

export const ROBOT_STATES = ['IDLE', 'MOVING', 'FAULT'] as const;
export const CONVEYOR_STATES = ['STOPPED', 'RUNNING', 'FAULT'] as const;

export const telemetryMessageSchema = z
  .object({
    ...envelope,
    seq: sequenceSchema,
    boxesTotal: z.int().nonnegative(),
    palletsTotal: z.int().nonnegative(),
    pallet: z.object({
      currentLayer: z.int().min(1),
      layersPerPallet: z.int().min(1),
      boxesInLayer: z.int().nonnegative(),
      boxesPerLayer: z.int().min(1),
    }),
    cycleTimeMs: z.int().nonnegative().nullable(),
    throughputBoxesPerHour: z.number().nonnegative(),
    robot: z.object({ state: z.enum(ROBOT_STATES) }),
    conveyor: z.object({ state: z.enum(CONVEYOR_STATES) }),
  })
  .refine((message) => message.pallet.currentLayer <= message.pallet.layersPerPallet, {
    message: 'La capa en curso no puede superar las capas del pallet',
    path: ['pallet', 'currentLayer'],
  })
  .refine((message) => message.pallet.boxesInLayer <= message.pallet.boxesPerLayer, {
    message: 'Las cajas de la capa en curso no pueden superar las de una capa completa',
    path: ['pallet', 'boxesInLayer'],
  });
export type TelemetryMessage = z.infer<typeof telemetryMessageSchema>;

export const messageSchemas = {
  status: statusMessageSchema,
  state: stateMessageSchema,
  telemetry: telemetryMessageSchema,
} as const satisfies Record<MessageKind, z.ZodType>;

export interface MessageByKind {
  status: StatusMessage;
  state: StateMessage;
  telemetry: TelemetryMessage;
}

export type ContractMessage = MessageByKind[MessageKind];
