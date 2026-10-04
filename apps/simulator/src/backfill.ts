import type { BrokerConnection, Logger, PublishOptions } from './broker.ts';
import type { Random } from './domain/random.ts';
import { ScriptedIncidents } from './daily-script.ts';
import type { DailyScript } from './daily-script.ts';
import { IncidentGenerator } from './incident-generator.ts';
import type { MessageFactory } from './messages.ts';
import type { IncidentRates } from './scenarios.ts';
import { Simulator } from './simulator.ts';
import type { SimulatorOptions } from './simulator.ts';
import { VirtualClock } from './virtual-clock.ts';

const DAY_MS = 86_400_000;
/** Cada cuánto tiempo simulado se espera a que el broker confirme lo publicado. */
const STEP_MS = 60_000;

export interface BackfillOptions {
  readonly simulator: SimulatorOptions;
  readonly incidents: IncidentRates | null;
  /** Guion diario del escenario, si lo tiene (ADR-0019). */
  readonly script?: DailyScript;
  /** Inicio y fin del histórico, en milisegundos de época Unix. */
  readonly fromMs: number;
  readonly toMs: number;
  readonly connection: BrokerConnection;
  readonly messages: MessageFactory;
  readonly random: Random;
  readonly logger: Logger;
}

/**
 * Genera el histórico de una célula entre dos instantes (LF-77): ejecuta el
 * simulador con un reloj virtual y publica sus mensajes con las marcas de
 * tiempo simuladas, en orden y sin esperar entre ellos. Los mensajes no se
 * retienen: no representan el estado actual de la célula. Devuelve cuántos se
 * publicaron.
 *
 * La API descarta una sesión anterior a la que ya conoce (ADR-0004), así que
 * el histórico se carga en una célula sin datos más recientes, antes de
 * arrancar el simulador en directo.
 */
export async function backfill(options: BackfillOptions): Promise<number> {
  const clock = new VirtualClock(options.fromMs);
  let pending: Promise<void>[] = [];
  let published = 0;
  let connected: (() => void) | undefined;

  const connection: BrokerConnection = {
    publish(topic: string, payload: string, publishOptions: PublishOptions) {
      published++;
      const sent = options.connection.publish(topic, payload, { ...publishOptions, retain: false });
      pending.push(sent);
      return sent;
    },
    onConnect(listener) {
      connected = listener;
    },
    // La conexión real la cierra quien la abrió.
    close: () => Promise.resolve(),
  };

  const simulator = new Simulator(
    { ...options.simulator, minTelemetryIntervalMs: options.simulator.heartbeatMs },
    {
      connection,
      messages: options.messages,
      logger: options.logger,
      random: options.random,
      now: clock.now,
      scheduler: clock,
    },
  );
  const incidents = new IncidentGenerator({
    target: simulator,
    rates: options.incidents,
    network: null,
    random: options.random,
    logger: options.logger,
    scheduler: clock,
  });
  const scripted =
    options.script === undefined
      ? undefined
      : new ScriptedIncidents({
          target: simulator,
          script: options.script,
          logger: options.logger,
          now: clock.now,
          scheduler: clock,
        });

  simulator.start();
  connected?.();
  incidents.start();
  scripted?.start();

  let nextReport = options.fromMs + DAY_MS;
  for (let t = options.fromMs; t < options.toMs; t = Math.min(t + STEP_MS, options.toMs)) {
    clock.runUntil(Math.min(t + STEP_MS, options.toMs));
    await Promise.all(pending);
    pending = [];
    if (clock.now() >= nextReport) {
      options.logger.info(
        { day: new Date(clock.now()).toISOString().slice(0, 10), published },
        'Histórico generado hasta este día',
      );
      nextReport += DAY_MS;
    }
  }

  incidents.stop();
  scripted?.stop();
  await simulator.stop();
  await Promise.all(pending);
  return published;
}
