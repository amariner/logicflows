const WINDOW_MS = 60_000;
const MS_PER_HOUR = 3_600_000;

/** Ritmo de producción como media móvil de los últimos 60 segundos. */
export class ThroughputMeter {
  readonly #boxTimes: number[] = [];

  record(atMs: number): void {
    this.#boxTimes.push(atMs);
  }

  /** Cajas por hora según las cajas registradas en los últimos 60 segundos. */
  boxesPerHour(nowMs: number): number {
    const windowStart = nowMs - WINDOW_MS;
    while (this.#boxTimes.length > 0 && (this.#boxTimes[0] ?? 0) <= windowStart) {
      this.#boxTimes.shift();
    }
    return (this.#boxTimes.length * MS_PER_HOUR) / WINDOW_MS;
  }
}
