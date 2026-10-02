import type { CellEvent, CellState, WaitingReason } from '@logicflows/contract';

import type { BrokerConnection, Logger, PublishOptions } from './broker.ts';
import { ALARMS } from './domain/alarms.ts';
import type { AlarmDefinition } from './domain/alarms.ts';
import { PalletizingCell } from './domain/cell.ts';
import { componentStates } from './domain/components.ts';
import { cycleDurationMs } from './domain/cycle.ts';
import type { PalletFormat } from './domain/production.ts';
import type { Random } from './domain/random.ts';
import type { MessageFactory } from './messages.ts';
import { withTimeout } from './mqtt/connection.ts';
import { realScheduler } from './scheduler.ts';
import type { Scheduled, Scheduler } from './scheduler.ts';

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
  /** Tiempo hasta que el operario resuelve un fallo y rearma la célula. */
  readonly faultRecoveryMs: number;
  /** Tiempo hasta que se libera la parada de emergencia y se rearma la seguridad. */
  readonly emergencyStopRecoveryMs: number;
  /** Tiempo entre el rearme y la orden de arranque del operario. */
  readonly restartDelayMs: number;
  /** Intervalo máximo entre dos mensajes de telemetría (ADR-0004). */
  readonly heartbeatMs: number;
  /**
   * Intervalo mínimo entre dos telemetrías por cajas. En directo es 0: una
   * por caja. Al generar un histórico se espacian para no publicar millones
   * de mensajes; los contadores son acumulados y la producción no cambia.
   */
  readonly minTelemetryIntervalMs?: number;
}

export interface SimulatorDependencies {
  readonly connection: BrokerConnection;
  readonly messages: MessageFactory;
  readonly logger: Logger;
  readonly now?: () => number;
  readonly random?: Random;
  readonly scheduler?: Scheduler;
}

const RETAINED_QOS1: PublishOptions = { qos: 1, retain: true };
const RETAINED_QOS0: PublishOptions = { qos: 0, retain: true };
/** Tiempo máximo para confirmar el anuncio de desconexión al detenerse. */
const STOP_ANNOUNCE_TIMEOUT_MS = 2_000;

const SUPPLY_ALARMS: Readonly<Record<WaitingReason, AlarmDefinition>> = {
  STARVED: ALARMS.starved,
  BLOCKED: ALARMS.blocked,
};

/**
 * Simula una célula de paletizado y publica su conexión, su estado y su
 * telemetría según ADR-0004.
 *
 * La célula arranca y paletiza una caja por ciclo (con una variación
 * aleatoria del tiempo y una pausa para cambiar cada pallet completo). Admite
 * incidencias (fallos, parada de emergencia, esperas y pausas) que siguen las
 * transiciones y el rearme de ADR-0003: tras un fallo o una parada de
 * emergencia la célula vuelve a STOPPED y el operario da la orden de arranque.
 * Las incidencias no previstas en el estado actual se rechazan.
 */
export class Simulator {
  readonly #options: SimulatorOptions;
  readonly #connection: BrokerConnection;
  readonly #messages: MessageFactory;
  readonly #logger: Logger;
  readonly #now: () => number;
  readonly #random: Random;
  readonly #cell: PalletizingCell;
  readonly #scheduler: Scheduler;
  readonly #timers = new Set<Scheduled>();
  #boxTimer: Scheduled | undefined;
  #heartbeatTimer: Scheduled | undefined;
  #lastTelemetryAtMs = Number.NEGATIVE_INFINITY;

  constructor(options: SimulatorOptions, dependencies: SimulatorDependencies) {
    this.#options = options;
    this.#connection = dependencies.connection;
    this.#messages = dependencies.messages;
    this.#logger = dependencies.logger;
    this.#now = dependencies.now ?? Date.now;
    this.#random = dependencies.random ?? Math.random;
    this.#scheduler = dependencies.scheduler ?? realScheduler;
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
    this.#heartbeatTimer = this.#scheduler.every(this.#options.heartbeatMs, () => {
      this.#heartbeat();
    });
    this.#startSequence();
  }

  /** Detiene la célula de forma controlada y anuncia la desconexión. */
  async stop(): Promise<void> {
    for (const timer of this.#timers) {
      timer.cancel();
    }
    this.#timers.clear();
    this.#heartbeatTimer?.cancel();
    this.#boxTimer?.cancel();
    this.#boxTimer = undefined;
    if (this.#cell.accepts('stop')) {
      this.#transition('stop');
    }
    // Una desconexión limpia no dispara el Last Will: se publica explícitamente.
    // La parada debe terminar aunque el broker no confirme, porque el
    // orquestador solo concede unos segundos tras SIGTERM.
    const announced = await withTimeout(
      this.#publish('status', this.#messages.status(false, this.#now()), RETAINED_QOS1),
      STOP_ANNOUNCE_TIMEOUT_MS,
    );
    if (!announced) {
      this.#logger.warn({}, 'No se confirmó el anuncio de desconexión');
    }
    await this.#connection.close();
  }

  /**
   * Fallo de la célula: pasa a FAULT con su alarma. Tras `faultRecoveryMs` el
   * operario lo resuelve y rearma, y tras `restartDelayMs` da la orden de
   * arranque. Durante una parada de emergencia solo se registra la alarma.
   */
  fault(alarm: AlarmDefinition): boolean {
    const state = this.#cell.status.state;
    if (state === 'EMERGENCY_STOP') {
      this.#cell.raiseAlarm(alarm, this.#now());
      this.#publishState(true);
      this.#afterDelay(this.#options.faultRecoveryMs, () => {
        this.#recoverFromFault(alarm);
      });
      return true;
    }
    if (!this.#cell.accepts('fault')) {
      return this.#reject('fault');
    }
    this.#cell.clearAlarmsFrom('supply');
    this.#cell.raiseAlarm(alarm, this.#now());
    this.#transition('fault');
    this.#afterDelay(this.#options.faultRecoveryMs, () => {
      this.#recoverFromFault(alarm);
    });
    return true;
  }

  /**
   * Parada de emergencia desde cualquier estado. Tras
   * `emergencyStopRecoveryMs` se libera y se rearma: la célula vuelve a
   * STOPPED, o a FAULT si hay fallos activos.
   */
  emergencyStop(): boolean {
    if (!this.#cell.accepts('emergencyStop')) {
      return this.#reject('emergencyStop');
    }
    this.#cell.clearAlarmsFrom('supply');
    this.#cell.raiseAlarm(ALARMS.emergencyStop, this.#now());
    this.#transition('emergencyStop');
    this.#afterDelay(this.#options.emergencyStopRecoveryMs, () => {
      this.#cell.clearAlarm(ALARMS.emergencyStop.code);
      const target: CellState = this.#cell.hasActiveFault() ? 'FAULT' : 'STOPPED';
      this.#transition('reset', target);
      if (target === 'STOPPED') {
        this.#afterDelay(this.#options.restartDelayMs, () => {
          this.#startSequence();
        });
      }
    });
    return true;
  }

  /**
   * Espera por una causa externa: sin cajas a la entrada (STARVED) o con la
   * salida ocupada (BLOCKED). La célula reanuda sola tras `durationMs`.
   */
  supplyInterruption(reason: WaitingReason, durationMs: number): boolean {
    const event: CellEvent = reason === 'STARVED' ? 'starved' : 'blocked';
    if (!this.#cell.accepts(event)) {
      return this.#reject(event);
    }
    const alarm = SUPPLY_ALARMS[reason];
    this.#cell.raiseAlarm(alarm, this.#now());
    this.#transition(event);
    this.#afterDelay(durationMs, () => {
      if (!this.#cell.alarms.some((active) => active.code === alarm.code)) {
        return;
      }
      this.#cell.clearAlarm(alarm.code);
      if (this.#cell.accepts('supplyRestored')) {
        this.#transition('supplyRestored');
      } else {
        this.#publishState(true);
      }
    });
    return true;
  }

  /** Pausa del operario, que reanuda la producción tras `durationMs`. */
  pause(durationMs: number): boolean {
    if (!this.#cell.accepts('pause')) {
      return this.#reject('pause');
    }
    this.#cell.clearAlarmsFrom('supply');
    this.#transition('pause');
    this.#afterDelay(durationMs, () => {
      if (this.#cell.accepts('resume')) {
        this.#transition('resume');
      }
    });
    return true;
  }

  #recoverFromFault(alarm: AlarmDefinition): void {
    this.#cell.clearAlarm(alarm.code);
    if (this.#cell.status.state !== 'FAULT') {
      // Resuelto durante una parada de emergencia: su rearme decide el estado.
      this.#publishState(true);
      return;
    }
    if (this.#cell.hasActiveFault()) {
      this.#publishState(true);
      return;
    }
    this.#transition('reset');
    this.#afterDelay(this.#options.restartDelayMs, () => {
      this.#startSequence();
    });
  }

  #startSequence(): void {
    if (!this.#cell.accepts('start')) {
      return;
    }
    this.#transition('start');
    this.#afterDelay(this.#options.startupDurationMs, () => {
      if (this.#cell.accepts('started')) {
        this.#transition('started');
      }
    });
  }

  #reject(event: CellEvent): false {
    this.#logger.debug(
      { event, state: this.#cell.status.state },
      'Incidencia no prevista en el estado actual',
    );
    return false;
  }

  #afterDelay(delayMs: number, action: () => void): void {
    const timer = this.#scheduler.after(delayMs, () => {
      this.#timers.delete(timer);
      action();
    });
    this.#timers.add(timer);
  }

  #processBox(): void {
    const palletsBefore = this.#cell.production(this.#now()).palletsTotal;
    const production = this.#cell.processBox(this.#now());
    this.#logger.debug({ boxesTotal: production.boxesTotal }, 'Caja paletizada');
    const minInterval = this.#options.minTelemetryIntervalMs ?? 0;
    if (this.#now() - this.#lastTelemetryAtMs >= minInterval) {
      this.#publishTelemetry();
    }

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

  #transition(event: CellEvent, to?: CellState): void {
    const status = this.#cell.apply(event, this.#now(), to);
    this.#logger.info(
      { event, state: status.state, alarms: this.#cell.alarms.map((alarm) => alarm.code) },
      'Cambio de estado',
    );
    this.#updateBoxTimer();
    this.#publishState(false);
    this.#publishTelemetry();
  }

  /** Las cajas solo llegan mientras la célula produce. */
  #updateBoxTimer(): void {
    const running = this.#cell.status.state === 'RUNNING';
    if (running && this.#boxTimer === undefined) {
      this.#scheduleNextBox(0);
    } else if (!running && this.#boxTimer !== undefined) {
      this.#boxTimer.cancel();
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
    this.#boxTimer = this.#scheduler.after(extraDelayMs + cycle, () => {
      this.#boxTimer = undefined;
      this.#processBox();
    });
  }

  #publishSnapshot(): void {
    void this.#publish('status', this.#messages.status(true, this.#now()), RETAINED_QOS1);
    this.#publishState(false);
    this.#publishTelemetry();
  }

  #publishState(alarmsOnly: boolean): void {
    const message = this.#messages.state(
      this.#cell.status,
      this.#cell.alarms,
      this.#now(),
      alarmsOnly,
    );
    void this.#publish('state', message, RETAINED_QOS1);
  }

  #publishTelemetry(): void {
    const now = this.#now();
    this.#lastTelemetryAtMs = now;
    const message = this.#messages.telemetry(
      this.#cell.production(now),
      this.#cell.format,
      componentStates(this.#cell.status, this.#cell.alarms),
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
