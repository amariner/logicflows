import { targetStates } from '@logicflows/contract';
import type { CellEvent, CellState, WaitingReason } from '@logicflows/contract';

import { isFaultAlarm } from './alarms.ts';
import type { ActiveAlarm, AlarmDefinition, AlarmSource } from './alarms.ts';
import { INITIAL_COUNTERS, placeBox } from './production.ts';
import type { PalletFormat, ProductionCounters } from './production.ts';
import { ThroughputMeter } from './throughput.ts';

export interface CellStatus {
  readonly state: CellState;
  readonly previousState: CellState | null;
  readonly event: CellEvent | null;
  readonly waitingReason: WaitingReason | null;
  readonly sinceMs: number;
}

export interface CellProduction extends ProductionCounters {
  readonly cycleTimeMs: number | null;
  readonly throughputBoxesPerHour: number;
}

const WAITING_REASON_BY_EVENT: Partial<Record<CellEvent, WaitingReason>> = {
  starved: 'STARVED',
  blocked: 'BLOCKED',
};

/**
 * Modelo de una célula de paletizado. Aplica solo las transiciones previstas
 * por el contrato (ADR-0003) y lleva la cuenta de la producción. No depende
 * del reloj: cada operación recibe el instante en el que ocurre.
 */
export class PalletizingCell {
  readonly #format: PalletFormat;
  readonly #throughput = new ThroughputMeter();
  #status: CellStatus;
  #counters: ProductionCounters = INITIAL_COUNTERS;
  #lastBoxAtMs: number | null = null;
  #cycleTimeMs: number | null = null;
  readonly #alarms = new Map<string, ActiveAlarm>();

  constructor(format: PalletFormat, startedAtMs: number) {
    this.#format = format;
    this.#status = {
      state: 'STOPPED',
      previousState: null,
      event: null,
      waitingReason: null,
      sinceMs: startedAtMs,
    };
  }

  get format(): PalletFormat {
    return this.#format;
  }

  get status(): CellStatus {
    return this.#status;
  }

  /** Indica si el evento está previsto en el estado actual. */
  accepts(event: CellEvent): boolean {
    return targetStates(this.#status.state, event).length > 0;
  }

  /**
   * Aplica un evento. Cuando el evento admite varios destinos (el rearme de
   * una parada de emergencia), `to` elige el destino; si se omite, el primero.
   */
  apply(event: CellEvent, atMs: number, to?: CellState): CellStatus {
    const targets = targetStates(this.#status.state, event);
    const target = to ?? targets[0];
    if (target === undefined || !targets.includes(target)) {
      throw new Error(`El evento ${event} no está previsto en el estado ${this.#status.state}`);
    }
    this.#status = {
      state: target,
      previousState: this.#status.state,
      event,
      waitingReason: target === 'WAITING' ? (WAITING_REASON_BY_EVENT[event] ?? null) : null,
      sinceMs: atMs,
    };
    return this.#status;
  }

  /** Registra una caja paletizada. Solo es posible mientras la célula produce. */
  processBox(atMs: number): CellProduction {
    if (this.#status.state !== 'RUNNING') {
      throw new Error(`No se puede paletizar una caja en el estado ${this.#status.state}`);
    }
    this.#cycleTimeMs = this.#lastBoxAtMs === null ? null : atMs - this.#lastBoxAtMs;
    this.#lastBoxAtMs = atMs;
    this.#counters = placeBox(this.#counters, this.#format);
    this.#throughput.record(atMs);
    return this.production(atMs);
  }

  /** Alarmas activas, en el orden en que se activaron. */
  get alarms(): readonly ActiveAlarm[] {
    return [...this.#alarms.values()];
  }

  /** Activa una alarma. Si ya estaba activa, conserva el momento original. */
  raiseAlarm(alarm: AlarmDefinition, atMs: number): void {
    if (!this.#alarms.has(alarm.code)) {
      this.#alarms.set(alarm.code, { ...alarm, raisedAtMs: atMs });
    }
  }

  clearAlarm(code: string): void {
    this.#alarms.delete(code);
  }

  clearAlarmsFrom(source: AlarmSource): void {
    for (const alarm of this.#alarms.values()) {
      if (alarm.source === source) {
        this.#alarms.delete(alarm.code);
      }
    }
  }

  /** Indica si hay algún fallo de la propia célula activo. */
  hasActiveFault(): boolean {
    return this.alarms.some(isFaultAlarm);
  }

  production(atMs: number): CellProduction {
    return {
      ...this.#counters,
      cycleTimeMs: this.#cycleTimeMs,
      throughputBoxesPerHour: this.#throughput.boxesPerHour(atMs),
    };
  }
}
