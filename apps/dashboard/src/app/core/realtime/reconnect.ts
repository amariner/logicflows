const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

/**
 * Espera antes del intento de reconexión `attempt` (0, 1, 2…): crece de forma
 * exponencial hasta 30 segundos y varía al azar entre la mitad y el total,
 * para que todos los visores no reconecten a la vez tras reiniciarse la API.
 */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
