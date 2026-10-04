import type { WaitingReason } from '@logicflows/contract';

import type { Logger } from './broker.ts';
import { FAULT_ALARMS } from './domain/alarms.ts';
import type { IncidentTarget } from './incident-generator.ts';
import { realScheduler } from './scheduler.ts';
import type { Scheduled, Scheduler } from './scheduler.ts';

/** Una incidencia del guion, a una hora local del día (`HH:MM`). */
export type ScriptedIncident =
  | {
      readonly at: string;
      readonly kind: 'starved' | 'blocked' | 'pause';
      readonly minutes: number;
    }
  | { readonly at: string; readonly kind: 'fault'; readonly alarm: string }
  | { readonly at: string; readonly kind: 'emergencyStop' };

/** Lo que pasa cada día en la célula de la demo (ADR-0019). */
export interface DailyScript {
  /** Zona horaria de las horas del guion. */
  readonly timeZone: string;
  readonly incidents: readonly ScriptedIncident[];
}

const MINUTES_PER_DAY = 1_440;
const TICK_MS = 10_000;
/** Un salto mayor del reloj (el equipo estuvo dormido) no repite lo que se saltó. */
const MAX_CATCH_UP_MINUTES = 5;

const SUPPLY_REASON: Record<'starved' | 'blocked', WaitingReason> = {
  starved: 'STARVED',
  blocked: 'BLOCKED',
};

/** Minuto del día (0 a 1 439) de un instante en una zona horaria. */
export function minuteOfDay(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ms);
  const value = (type: 'hour' | 'minute') =>
    Number(parts.find((part) => part.type === type)?.value);
  return value('hour') * 60 + value('minute');
}

/** Minuto del día de una hora `HH:MM`; falla si no es válida. */
export function parseTime(at: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(at);
  if (match === null) {
    throw new Error(`Hora del guion no válida: «${at}» (se espera HH:MM)`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Comprueba el guion: horas válidas y sin repetir, y alarmas del catálogo. */
export function validateScript(script: DailyScript): void {
  const seen = new Set<number>();
  for (const incident of script.incidents) {
    const minute = parseTime(incident.at);
    if (seen.has(minute)) {
      throw new Error(`El guion tiene dos incidencias a las ${incident.at}`);
    }
    seen.add(minute);
    if (incident.kind === 'fault' && !FAULT_ALARMS.some((a) => a.code === incident.alarm)) {
      throw new Error(`Alarma desconocida en el guion: ${incident.alarm}`);
    }
  }
}

/**
 * Sigue un guion diario de incidencias (ADR-0019): cada incidencia ocurre a
 * su hora local, todos los días. Lo decide el reloj, no el azar, así que el
 * día se repite igual aunque el simulador se reinicie. Al arrancar no repite
 * lo que ya pasó: sigue desde la hora actual.
 */
export class ScriptedIncidents {
  readonly #target: IncidentTarget;
  readonly #script: DailyScript;
  readonly #byMinute: ReadonlyMap<number, ScriptedIncident>;
  readonly #logger: Logger;
  readonly #now: () => number;
  readonly #scheduler: Scheduler;
  #lastMinute = -1;
  #timer: Scheduled | undefined;

  constructor(options: {
    target: IncidentTarget;
    script: DailyScript;
    logger: Logger;
    now?: () => number;
    scheduler?: Scheduler;
  }) {
    validateScript(options.script);
    this.#target = options.target;
    this.#script = options.script;
    this.#byMinute = new Map(options.script.incidents.map((i) => [parseTime(i.at), i]));
    this.#logger = options.logger;
    this.#now = options.now ?? Date.now;
    this.#scheduler = options.scheduler ?? realScheduler;
  }

  start(): void {
    this.#lastMinute = minuteOfDay(this.#now(), this.#script.timeZone);
    this.#timer = this.#scheduler.every(TICK_MS, () => {
      this.tick();
    });
  }

  stop(): void {
    this.#timer?.cancel();
  }

  /** Provoca las incidencias de los minutos transcurridos desde la última vez. */
  tick(): void {
    const minute = minuteOfDay(this.#now(), this.#script.timeZone);
    const elapsed = (minute - this.#lastMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (elapsed > MAX_CATCH_UP_MINUTES) {
      this.#logger.warn({ elapsed }, 'El reloj ha saltado: el guion sigue desde ahora');
    } else {
      for (let step = 1; step <= elapsed; step++) {
        const incident = this.#byMinute.get((this.#lastMinute + step) % MINUTES_PER_DAY);
        if (incident !== undefined) {
          this.#run(incident);
        }
      }
    }
    this.#lastMinute = minute;
  }

  #run(incident: ScriptedIncident): void {
    const accepted = this.#apply(incident);
    if (accepted) {
      this.#logger.info({ incident: incident.kind, at: incident.at }, 'Incidencia del guion');
    } else {
      this.#logger.warn(
        { incident: incident.kind, at: incident.at },
        'La célula no admitía la incidencia del guion',
      );
    }
  }

  #apply(incident: ScriptedIncident): boolean {
    switch (incident.kind) {
      case 'starved':
      case 'blocked':
        return this.#target.supplyInterruption(
          SUPPLY_REASON[incident.kind],
          incident.minutes * 60_000,
        );
      case 'pause':
        return this.#target.pause(incident.minutes * 60_000);
      case 'emergencyStop':
        return this.#target.emergencyStop();
      case 'fault': {
        const alarm = FAULT_ALARMS.find((a) => a.code === incident.alarm);
        return alarm !== undefined && this.#target.fault(alarm);
      }
    }
  }
}
