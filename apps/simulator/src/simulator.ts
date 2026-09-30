import type { CellEvent } from '@logicflows/contract';

import type { BrokerConnection, Logger, PublishOptions } from './broker.ts';
import { PalletizingCell } from './domain/cell.ts';
import { componentStates } from './domain/components.ts';
import type { PalletFormat } from './domain/production.ts';
import type { MessageFactory } from './messages.ts';

export interface SimulatorOptions {
  readonly format: PalletFormat;
  /** Tiempo entre cajas mientras la célula produce. */
  readonly boxIntervalMs: number;
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
}

const RETAINED_QOS1: PublishOptions = { qos: 1, retain: true };
const RETAINED_QOS0: PublishOptions = { qos: 0, retain: true };

/**
 * Simula una célula que arranca, paletiza una caja cada `boxIntervalMs` y
 * publica su conexión, su estado y su telemetría según ADR-0004. Tras cada
 * conexión o reconexión con el broker vuelve a publicar su situación actual.
 */
export class Simulator {
  readonly #options: SimulatorOptions;
  readonly #connection: BrokerConnection;
  readonly #messages: MessageFactory;
  readonly #logger: Logger;
  readonly #now: () => number;
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
    clearInterval(this.#boxTimer);
    this.#boxTimer = undefined;
    if (this.#cell.accepts('stop')) {
      this.#transition('stop');
    }
    // Una desconexión limpia no dispara el Last Will: se publica explícitamente.
    await this.#publish('status', this.#messages.status(false, this.#now()), RETAINED_QOS1);
    await this.#connection.close();
  }

  #processBox(): void {
    const production = this.#cell.processBox(this.#now());
    this.#logger.debug({ boxesTotal: production.boxesTotal }, 'Caja paletizada');
    this.#publishTelemetry();
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

  /** Las cajas llegan cada `boxIntervalMs` solo mientras la célula produce. */
  #updateBoxTimer(): void {
    const running = this.#cell.status.state === 'RUNNING';
    if (running && this.#boxTimer === undefined) {
      this.#boxTimer = setInterval(() => {
        this.#processBox();
      }, this.#options.boxIntervalMs);
    } else if (!running && this.#boxTimer !== undefined) {
      clearInterval(this.#boxTimer);
      this.#boxTimer = undefined;
    }
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
