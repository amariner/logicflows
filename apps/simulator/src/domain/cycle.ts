import type { Random } from './random.ts';

/**
 * Duración de un ciclo de paletizado: el tiempo nominal más una variación
 * aleatoria uniforme de ±`variation` (0,1 = ±10 %). Un robot real no tarda
 * siempre lo mismo: depende de la posición de la caja en la capa y de la
 * cinta.
 */
export function cycleDurationMs(nominalMs: number, variation: number, random: Random): number {
  return Math.round(nominalMs * (1 + variation * (2 * random() - 1)));
}
