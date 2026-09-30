import type { WaitingReason } from '@logicflows/contract';

import type { Logger } from './broker.ts';
import { FAULT_ALARMS } from './domain/alarms.ts';
import type { AlarmDefinition } from './domain/alarms.ts';
import type { Random } from './domain/random.ts';
import type { DurationRange, IncidentRates, NetworkChaos } from './scenarios.ts';

/** Acciones que el generador puede provocar en la célula simulada. */
export interface IncidentTarget {
  fault(alarm: AlarmDefinition): boolean;
  emergencyStop(): boolean;
  supplyInterruption(reason: WaitingReason, durationMs: number): boolean;
  pause(durationMs: number): boolean;
}

/** Corta la conexión con el broker durante un tiempo. */
export interface Interruptible {
  interrupt(durationMs: number): void;
}

const TICK_MS = 1_000;
const TICKS_PER_HOUR = 3_600_000 / TICK_MS;

export const randomDuration = ({ minMs, maxMs }: DurationRange, random: Random): number =>
  Math.round(minMs + random() * (maxMs - minMs));

/**
 * Provoca incidencias al azar según la frecuencia por hora de cada una. Cada
 * segundo decide de forma independiente si ocurre cada incidencia, así que el
 * número de incidencias sigue aproximadamente una distribución de Poisson.
 */
export class IncidentGenerator {
  readonly #target: IncidentTarget;
  readonly #rates: IncidentRates | null;
  readonly #network: (NetworkChaos & { readonly connection: Interruptible }) | null;
  readonly #random: Random;
  readonly #logger: Logger;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: {
    target: IncidentTarget;
    rates: IncidentRates | null;
    network: (NetworkChaos & { readonly connection: Interruptible }) | null;
    random: Random;
    logger: Logger;
  }) {
    this.#target = options.target;
    this.#rates = options.rates;
    this.#network = options.network;
    this.#random = options.random;
    this.#logger = options.logger;
  }

  start(): void {
    if (this.#rates === null && this.#network === null) {
      return;
    }
    this.#timer = setInterval(() => {
      this.tick();
    }, TICK_MS);
  }

  stop(): void {
    clearInterval(this.#timer);
  }

  /** Evalúa una vez cada incidencia. Público para poder probarlo. */
  tick(): void {
    const rates = this.#rates;
    if (rates !== null) {
      if (this.#occurs(rates.emergencyStopPerHour)) {
        this.#report('emergencyStop', this.#target.emergencyStop());
      }
      if (this.#occurs(rates.faultPerHour)) {
        const alarm = FAULT_ALARMS[Math.floor(this.#random() * FAULT_ALARMS.length)];
        if (alarm !== undefined) {
          this.#report('fault', this.#target.fault(alarm));
        }
      }
      if (this.#occurs(rates.starvedPerHour)) {
        const duration = randomDuration(rates.supplyDuration, this.#random);
        this.#report('starved', this.#target.supplyInterruption('STARVED', duration));
      }
      if (this.#occurs(rates.blockedPerHour)) {
        const duration = randomDuration(rates.supplyDuration, this.#random);
        this.#report('blocked', this.#target.supplyInterruption('BLOCKED', duration));
      }
      if (this.#occurs(rates.pausePerHour)) {
        this.#report(
          'pause',
          this.#target.pause(randomDuration(rates.pauseDuration, this.#random)),
        );
      }
    }
    const network = this.#network;
    if (network !== null && this.#occurs(network.disconnectPerHour)) {
      const duration = randomDuration(network.disconnectDuration, this.#random);
      this.#logger.info({ durationMs: duration }, 'Corte de red simulado');
      network.connection.interrupt(duration);
    }
  }

  #occurs(perHour: number): boolean {
    return this.#random() < perHour / TICKS_PER_HOUR;
  }

  #report(incident: string, accepted: boolean): void {
    if (accepted) {
      this.#logger.info({ incident }, 'Incidencia simulada');
    }
  }
}
