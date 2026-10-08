import { CELL_EVENTS, CELL_STATES, WAITING_REASONS } from '@logicflows/contract';
import type { Alarm, AlarmSeverity } from '@logicflows/contract';
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Los valores de los enumerados vienen del contrato: un estado nuevo exige
// una migración, como cualquier otro cambio del contrato.
export const cellStateEnum = pgEnum('cell_state', CELL_STATES);
export const cellEventEnum = pgEnum('cell_event', CELL_EVENTS);
export const waitingReasonEnum = pgEnum('waiting_reason', WAITING_REASONS);
export const robotStateEnum = pgEnum('robot_state', ['IDLE', 'MOVING', 'FAULT']);
export const conveyorStateEnum = pgEnum('conveyor_state', ['STOPPED', 'RUNNING', 'FAULT']);

const instant = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });

/** Campos comunes de los mensajes de ADR-0004. */
const messageColumns = () => ({
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  siteId: text('site_id').notNull(),
  cellId: text('cell_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  messageId: uuid('message_id').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  /** Momento en el que se generó el dato en la célula. */
  sourceTimestamp: instant('source_timestamp').notNull(),
  /** Momento en el que la API recibió el mensaje. */
  receivedAt: instant('received_at').notNull(),
});

/** Cambios de conexión de cada célula. */
export const cellStatusEvents = pgTable(
  'cell_status_events',
  {
    ...messageColumns(),
    online: boolean('online').notNull(),
  },
  (table) => [
    // status no lleva secuencia: el mismo mensaje reenviado tiene la misma
    // sesión, conexión y marca de tiempo.
    uniqueIndex('cell_status_events_message_uq').on(
      table.siteId,
      table.cellId,
      table.sessionId,
      table.online,
      table.sourceTimestamp,
    ),
    index('cell_status_events_cell_time_idx').on(table.siteId, table.cellId, table.sourceTimestamp),
  ],
);

/** Historial de estados de cada célula (ADR-0003) con sus alarmas activas. */
export const cellStateChanges = pgTable(
  'cell_state_changes',
  {
    ...messageColumns(),
    seq: integer('seq').notNull(),
    state: cellStateEnum('state').notNull(),
    previousState: cellStateEnum('previous_state'),
    event: cellEventEnum('event'),
    waitingReason: waitingReasonEnum('waiting_reason'),
    since: instant('since').notNull(),
    activeAlarms: jsonb('active_alarms').$type<Alarm[]>().notNull(),
  },
  (table) => [
    uniqueIndex('cell_state_changes_message_uq').on(
      table.siteId,
      table.cellId,
      table.sessionId,
      table.seq,
    ),
    index('cell_state_changes_cell_time_idx').on(table.siteId, table.cellId, table.sourceTimestamp),
  ],
);

/** Cada telemetría recibida, con los contadores acumulados de la célula. */
export const telemetrySamples = pgTable(
  'telemetry_samples',
  {
    ...messageColumns(),
    seq: integer('seq').notNull(),
    boxesTotal: integer('boxes_total').notNull(),
    palletsTotal: integer('pallets_total').notNull(),
    currentLayer: integer('current_layer').notNull(),
    layersPerPallet: integer('layers_per_pallet').notNull(),
    boxesInLayer: integer('boxes_in_layer').notNull(),
    boxesPerLayer: integer('boxes_per_layer').notNull(),
    cycleTimeMs: integer('cycle_time_ms'),
    throughputBoxesPerHour: doublePrecision('throughput_boxes_per_hour').notNull(),
    robotState: robotStateEnum('robot_state').notNull(),
    conveyorState: conveyorStateEnum('conveyor_state').notNull(),
  },
  (table) => [
    uniqueIndex('telemetry_samples_message_uq').on(
      table.siteId,
      table.cellId,
      table.sessionId,
      table.seq,
    ),
    index('telemetry_samples_cell_time_idx').on(table.siteId, table.cellId, table.sourceTimestamp),
  ],
);

/**
 * Dispositivos que reciben los avisos de alarmas (ADR-0015): el token de
 * Firebase Cloud Messaging de cada instalación de la app y su usuario.
 */
export const pushDevices = pgTable(
  'push_devices',
  {
    token: text('token').primaryKey(),
    /** Sujeto (`sub`) del usuario en el proveedor de identidad. */
    userId: text('user_id').notNull(),
    registeredAt: instant('registered_at').notNull(),
  },
  (table) => [index('push_devices_user_idx').on(table.userId)],
);

/**
 * Activaciones de alarmas ya avisadas. La restricción única garantiza un
 * solo aviso por activación aunque el mensaje llegue repetido, la API se
 * reinicie o haya varias réplicas (ADR-0015).
 */
export const pushNotifiedAlarms = pgTable(
  'push_notified_alarms',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    siteId: text('site_id').notNull(),
    cellId: text('cell_id').notNull(),
    code: text('code').notNull(),
    raisedAt: instant('raised_at').notNull(),
    notifiedAt: instant('notified_at').notNull(),
  },
  (table) => [
    uniqueIndex('push_notified_alarms_activation_uq').on(
      table.siteId,
      table.cellId,
      table.code,
      table.raisedAt,
    ),
  ],
);

/**
 * Resumen de cada hora de cada célula (ADR-0016): producción, segundos por
 * situación, paradas por causa y alarmas activadas. Se recalcula a partir del
 * dato en bruto y es lo que leen las consultas por periodo.
 */
export const cellHourly = pgTable(
  'cell_hourly',
  {
    siteId: text('site_id').notNull(),
    cellId: text('cell_id').notNull(),
    hour: instant('hour').notNull(),
    boxes: integer('boxes').notNull(),
    pallets: integer('pallets').notNull(),
    /** Segundos por situación (`TimeBucket` de src/history/hour-summary.ts). */
    seconds: jsonb('seconds').$type<Partial<Record<string, number>>>().notNull(),
    /** Paradas por causa, con sus segundos y las veces que empezaron. */
    stops: jsonb('stops')
      .$type<Partial<Record<string, { seconds: number; count: number }>>>()
      .notNull(),
    alarms: jsonb('alarms').$type<Partial<Record<AlarmSeverity, number>>>().notNull(),
    computedAt: instant('computed_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.cellId, table.hour] })],
);

/**
 * Horas que hay que recalcular porque llegó un mensaje que las afecta. Se
 * marcan al guardar cada mensaje y las vacía el proceso de agregación. Cada
 * marca sube la versión: el agregador solo quita la hora si no ha cambiado
 * mientras la calculaba (LF-114).
 */
export const cellHourlyPending = pgTable(
  'cell_hourly_pending',
  {
    siteId: text('site_id').notNull(),
    cellId: text('cell_id').notNull(),
    hour: instant('hour').notNull(),
    markedAt: instant('marked_at').notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.cellId, table.hour] })],
);

/** Quién creó una fila de configuración y cuándo (ADR-0021). */
const authorship = () => ({
  /** Sujeto (`sub`) del usuario en el proveedor de identidad. */
  createdBy: text('created_by').notNull(),
  /** Nombre de usuario en ese momento, para mostrarlo. */
  createdByName: text('created_by_name').notNull(),
  createdAt: instant('created_at').notNull(),
});

/**
 * Versiones del calendario de turnos de cada planta (ADR-0021). Cada una está
 * vigente desde su fecha local hasta la siguiente. Las vigentes y pasadas no
 * se modifican: la tabla es su propio registro de cambios.
 */
export const shiftCalendarVersions = pgTable(
  'shift_calendar_versions',
  {
    siteId: text('site_id').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    timeZone: text('time_zone').notNull(),
    ...authorship(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.effectiveFrom] })],
);

/** Turnos semanales de una versión del calendario, en horas en punto. */
export const shiftCalendarShifts = pgTable(
  'shift_calendar_shifts',
  {
    siteId: text('site_id').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    /** Día de la semana ISO 8601: 1 es lunes y 7 es domingo. */
    weekday: smallint('weekday').notNull(),
    startHour: smallint('start_hour').notNull(),
    /** Si es menor o igual que la de inicio, el turno termina el día siguiente. */
    endHour: smallint('end_hour').notNull(),
    name: text('name').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'shift_calendar_shifts_pk',
      columns: [table.siteId, table.effectiveFrom, table.weekday, table.startHour],
    }),
    // Borrar una versión futura borra sus turnos.
    foreignKey({
      name: 'shift_calendar_shifts_version_fk',
      columns: [table.siteId, table.effectiveFrom],
      foreignColumns: [shiftCalendarVersions.siteId, shiftCalendarVersions.effectiveFrom],
    }).onDelete('cascade'),
  ],
);

/** Días sin turnos de una planta: festivos, vacaciones o paradas (ADR-0021). */
export const shiftCalendarExceptions = pgTable(
  'shift_calendar_exceptions',
  {
    siteId: text('site_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    name: text('name').notNull(),
    ...authorship(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.date] })],
);

/**
 * Reconocimientos de alarmas (ADR-0022): una persona dice «la he visto y me
 * ocupo». La clave es la activación, así que cada una se reconoce una sola
 * vez, también con varias réplicas. No se modifican ni se borran salvo por
 * la retención, como los cambios de estado.
 */
export const alarmAcknowledgements = pgTable(
  'alarm_acknowledgements',
  {
    siteId: text('site_id').notNull(),
    cellId: text('cell_id').notNull(),
    code: text('code').notNull(),
    raisedAt: instant('raised_at').notNull(),
    /** Hora del servidor, nunca del navegador. */
    acknowledgedAt: instant('acknowledged_at').notNull(),
    /** Sujeto (`sub`) del usuario en el proveedor de identidad. */
    acknowledgedBy: text('acknowledged_by').notNull(),
    /** Nombre de usuario en ese momento, para mostrarlo. */
    acknowledgedByName: text('acknowledged_by_name').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'alarm_acknowledgements_pk',
      columns: [table.siteId, table.cellId, table.code, table.raisedAt],
    }),
    index('alarm_acknowledgements_time_idx').on(table.siteId, table.cellId, table.acknowledgedAt),
  ],
);
