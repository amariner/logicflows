import type { CellEvent } from '@logicflows/contract';

import type { BrokerConnection, Logger, PublishOptions } from './broker.ts';
import { PalletizingCell } from './domain/cell.ts';
import { componentStates } from './domain/components.ts';
import { cycleDurationMs } from './domain/cycle.ts';
import type { PalletFormat } from './domain/production.ts';
import type { Random } from './domain/random.ts';
import type { MessageFactory } from './messages.ts';

export interface SimulatorOptions {
  readonly format: PalletFormat;
  /** Tiempo nominal entre cajas mientras la célula produce. */
  readonly boxIntervalMs: number;
  /** Variación aleatoria del tiempo de ciclo: 0,1 = ±10 %. */
  readonly cycleVariation: number;
  /** Tiempo para retirar un pallet completo y colocar uno vacío. */
  readonly palletChangeMs: number;
  /** Duración de la secuencia de arranque. */
  readonly startupDurationMs: number;
  /** Intervalo máximo entre dos mensajes de telemetría (ADR-0004). */
  readonly heartbeatMs: number;
}

export interface SimulatorDependencies {
  readonly connection: BrokerConnection;
  readonly messages: MessageFactory;
  readonly logger: Logger;
  readonly now?: () => number;
  readonly random?: Random;
}

const RETAINED_QOS1: PublishOptions = { qos: 1, retain: true };
const RETAINED_QOS0: PublishOptions = { qos: 0, retain: true };

/**
 * Simula una célula que arranca, paletiza una caja por ciclo (con una
 * variación aleatoria del tiempo y una pausa para cambiar cada pallet
 * completo) y
 * publica su conexión, su estado y su telemetría según ADR-0004. Tras cada
 * conexión o reconexión con el broker vuelve a publicar su situación actual.
 */
export class Simulator {
  readonly #options: SimulatorOptions;
  readonly #connection: BrokerConnection;
  readonly #messages: MessageFactory;
  readonly #logger: Logger;
  readonly #now: () => number;
  readonly #random: Random;
  readonly #cell: PalletizingCell;
  readonly #timers: NodeJS.Timeout[] = [];
  #boxTimer: NodeJS.Timeout | undefined;
  #lastTelemetryAtMs = Number.NEGATIVE_INFINITY;

  constructor(options: SimulatorOptions, dependencies: SimulatorDependencies) {
    this.#options = options;
    this.#connection = dependencies.connection;
    this.#messages = dependencies.messages;
    this.#logger = dependencies.logger;
    this.#now = dependencies.now ?? Date.now;
    this.#random = dependencies.random ?? Math.random;
    this.#cell = new PalletizingCell(options.format, this.#now());
  }

  get cell(): PalletizingCell {
    return this.#cell;
  }

  start(): void {
    this.#connection.onConnect(() => {
      this.#logger.info({}, 'Conectado al broker');
      this.#publishSnapshot();
    });

    this.#transition('start');
    this.#timers.push(
      setTimeout(() => {
        this.#transition('started');
      }, this.#options.startupDurationMs),
      setInterval(() => {
        this.#heartbeat();
      }, this.#options.heartbeatMs),
    );
  }

  /** Detiene la célula de forma controlada y anuncia la desconexión. */
  async stop(): Promise<void> {
    for (const timer of this.#timers) {
      clearTimeout(timer);
    }
    this.#timers.length = 0;
    clearTimeout(this.#boxTimer);
    this.#boxTimer = undefined;
    if (this.#cell.accepts('stop')) {
      this.#transition('stop');
    }
    // Una desconexión limpia no dispara el Last Will: se publica explícitamente.
    await this.#publish('status', this.#messages.status(false, this.#now()), RETAINED_QOS1);
    await this.#connection.close();
  }

  #processBox(): void {
    const palletsBefore = this.#cell.production(this.#now()).palletsTotal;
    const production = this.#cell.processBox(this.#now());
    this.#logger.debug({ boxesTotal: production.boxesTotal }, 'Caja paletizada');
    this.#publishTelemetry();

    const palletCompleted = production.palletsTotal > palletsBefore;
    if (palletCompleted) {
      this.#logger.info({ palletsTotal: production.palletsTotal }, 'Pallet completado');
    }
    this.#scheduleNextBox(palletCompleted ? this.#options.palletChangeMs : 0);
  }

  #heartbeat(): void {
    if (this.#now() - this.#lastTelemetryAtMs >= this.#options.heartbeatMs) {
      this.#publishTelemetry();
    }
  }

  #transition(event: CellEvent): void {
    const status = this.#cell.apply(event, this.#now());
    this.#logger.info({ event, state: status.state }, 'Cambio de estado');
    this.#updateBoxTimer();
    void this.#publish('state', this.#messages.state(status, this.#now()), RETAINED_QOS1);
    this.#publishTelemetry();
  }

  /** Las cajas solo llegan mientras la célula produce. */
  #updateBoxTimer(): void {
    const running = this.#cell.status.state === 'RUNNING';
    if (running && this.#boxTimer === undefined) {
      this.#scheduleNextBox(0);
    } else if (!running && this.#boxTimer !== undefined) {
      clearTimeout(this.#boxTimer);
      this.#boxTimer = undefined;
    }
  }

  /** Programa la siguiente caja tras un ciclo, más una espera adicional. */
  #scheduleNextBox(extraDelayMs: number): void {
    const cycle = cycleDurationMs(
      this.#options.boxIntervalMs,
      this.#options.cycleVariation,
      this.#random,
    );
    this.#boxTimer = setTimeout(() => {
      this.#boxTimer = undefined;
      this.#processBox();
    }, extraDelayMs + cycle);
  }

  #publishSnapshot(): void {
    const now = this.#now();
    void this.#publish('status', this.#messages.status(true, now), RETAINED_QOS1);
    void this.#publish('state', this.#messages.state(this.#cell.status, now), RETAINED_QOS1);
    this.#publishTelemetry();
  }

  #publishTelemetry(): void {
    const now = this.#now();
    this.#lastTelemetryAtMs = now;
    const message = this.#messages.telemetry(
      this.#cell.production(now),
      this.#cell.format,
      componentStates(this.#cell.status),
      now,
    );
    void this.#publish('telemetry', message, RETAINED_QOS0);
  }

  async #publish(
    kind: 'status' | 'state' | 'telemetry',
    message: object,
    options: PublishOptions,
  ): Promise<void> {
    try {
      await this.#connection.publish(this.#messages.topic(kind), JSON.stringify(message), options);
    } catch (error) {
      if (kind === 'telemetry') {
        // Sin conexión, la telemetría con QoS 0 se descarta: la siguiente la sustituye.
        this.#logger.debug({ kind, error: String(error) }, 'Telemetría descartada sin conexión');
        return;
      }
      this.#logger.warn({ kind, error: String(error) }, 'No se pudo publicar el mensaje');
    }
  }
}
