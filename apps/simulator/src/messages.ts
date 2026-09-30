import { CURRENT_SCHEMA_VERSION, buildTopic } from '@logicflows/contract';
import type {
  MessageKind,
  StateMessage,
  StatusMessage,
  TelemetryMessage,
} from '@logicflows/contract';

import type { ActiveAlarm } from './domain/alarms.ts';
import type { CellProduction, CellStatus } from './domain/cell.ts';
import type { ComponentStates } from './domain/components.ts';
import type { PalletFormat } from './domain/production.ts';

export interface MessageFactoryOptions {
  readonly siteId: string;
  readonly cellId: string;
  /** Identificador de la sesión del publicador: nuevo en cada arranque. */
  readonly sessionId: string;
  /** Genera un UUID v7 para cada mensaje. */
  readonly newId: () => string;
}

const toIso = (ms: number): string => new Date(ms).toISOString();

/**
 * Construye los mensajes del contrato (ADR-0004) de una célula. Lleva una
 * secuencia independiente para `state` y para `telemetry`.
 */
export class MessageFactory {
  readonly #options: MessageFactoryOptions;
  #stateSeq = 0;
  #telemetrySeq = 0;

  constructor(options: MessageFactoryOptions) {
    this.#options = options;
  }

  topic(kind: MessageKind): string {
    return buildTopic({ siteId: this.#options.siteId, cellId: this.#options.cellId, kind });
  }

  status(online: boolean, atMs: number): StatusMessage {
    return { ...this.#envelope(atMs), online };
  }

  /**
   * Mensaje de estado. `alarmsOnly` indica que el mensaje solo actualiza las
   * alarmas activas, sin una transición: su evento es `null` (ADR-0004).
   */
  state(
    status: CellStatus,
    alarms: readonly ActiveAlarm[],
    atMs: number,
    alarmsOnly = false,
  ): StateMessage {
    return {
      ...this.#envelope(atMs),
      seq: this.#stateSeq++,
      state: status.state,
      previousState: status.previousState,
      event: alarmsOnly ? null : status.event,
      waitingReason: status.waitingReason,
      since: toIso(status.sinceMs),
      activeAlarms: alarms.map((alarm) => ({
        code: alarm.code,
        severity: alarm.severity,
        message: alarm.message,
        raisedAt: toIso(alarm.raisedAtMs),
      })),
    };
  }

  telemetry(
    production: CellProduction,
    format: PalletFormat,
    components: ComponentStates,
    atMs: number,
  ): TelemetryMessage {
    return {
      ...this.#envelope(atMs),
      seq: this.#telemetrySeq++,
      boxesTotal: production.boxesTotal,
      palletsTotal: production.palletsTotal,
      pallet: {
        currentLayer: production.currentLayer,
        layersPerPallet: format.layersPerPallet,
        boxesInLayer: production.boxesInLayer,
        boxesPerLayer: format.boxesPerLayer,
      },
      cycleTimeMs: production.cycleTimeMs,
      throughputBoxesPerHour: Math.round(production.throughputBoxesPerHour),
      robot: { state: components.robot },
      conveyor: { state: components.conveyor },
    };
  }

  #envelope(atMs: number) {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      messageId: this.#options.newId(),
      siteId: this.#options.siteId,
      cellId: this.#options.cellId,
      sessionId: this.#options.sessionId,
      timestamp: toIso(atMs),
    };
  }
}
