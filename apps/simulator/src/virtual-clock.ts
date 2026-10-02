import type { Scheduled, Scheduler } from './scheduler.ts';

interface Entry {
  readonly id: number;
  at: number;
  readonly action: () => void;
  /** Intervalo de repetición; sin él, se ejecuta una vez. */
  readonly intervalMs?: number;
  cancelled: boolean;
}

/**
 * Reloj virtual: el tiempo solo avanza con `runUntil`, que ejecuta en orden
 * los temporizadores vencidos sin esperar. Permite simular días de
 * producción en minutos (LF-77).
 */
export class VirtualClock implements Scheduler {
  #now: number;
  #nextId = 0;
  readonly #entries: Entry[] = [];

  constructor(startMs: number) {
    this.#now = startMs;
  }

  readonly now = (): number => this.#now;

  after(delayMs: number, action: () => void): Scheduled {
    return this.#schedule(delayMs, action);
  }

  every(intervalMs: number, action: () => void): Scheduled {
    return this.#schedule(intervalMs, action, Math.max(intervalMs, 1));
  }

  /** Avanza hasta `targetMs` ejecutando, en orden, cada temporizador vencido. */
  runUntil(targetMs: number): void {
    for (;;) {
      const next = this.#nextDue(targetMs);
      if (next === undefined) {
        break;
      }
      this.#now = next.at;
      if (next.intervalMs === undefined) {
        next.cancelled = true;
      } else {
        next.at += next.intervalMs;
      }
      next.action();
    }
    this.#now = Math.max(this.#now, targetMs);
    this.#compact();
  }

  #schedule(delayMs: number, action: () => void, intervalMs?: number): Scheduled {
    const entry: Entry = {
      id: this.#nextId++,
      at: this.#now + Math.max(delayMs, 0),
      action,
      intervalMs,
      cancelled: false,
    };
    this.#entries.push(entry);
    return {
      cancel: () => {
        entry.cancelled = true;
      },
    };
  }

  /** El más temprano no cancelado que vence antes de `targetMs`; a igualdad, el primero programado. */
  #nextDue(targetMs: number): Entry | undefined {
    let best: Entry | undefined;
    for (const entry of this.#entries) {
      if (entry.cancelled || entry.at > targetMs) {
        continue;
      }
      if (
        best === undefined ||
        entry.at < best.at ||
        (entry.at === best.at && entry.id < best.id)
      ) {
        best = entry;
      }
    }
    return best;
  }

  #compact(): void {
    for (let i = this.#entries.length - 1; i >= 0; i--) {
      if (this.#entries[i]?.cancelled === true) {
        this.#entries.splice(i, 1);
      }
    }
  }
}
