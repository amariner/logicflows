/** Un temporizador programado que se puede cancelar. */
export interface Scheduled {
  cancel(): void;
}

/**
 * Temporizadores del simulador. En directo son los de Node.js; para generar
 * un histórico, un reloj virtual los ejecuta sin esperar (LF-77).
 */
export interface Scheduler {
  after(delayMs: number, action: () => void): Scheduled;
  every(intervalMs: number, action: () => void): Scheduled;
}

export const realScheduler: Scheduler = {
  after: (delayMs, action) => {
    const timer = setTimeout(action, delayMs);
    return {
      cancel: () => {
        clearTimeout(timer);
      },
    };
  },
  every: (intervalMs, action) => {
    const timer = setInterval(action, intervalMs);
    return {
      cancel: () => {
        clearInterval(timer);
      },
    };
  },
};
