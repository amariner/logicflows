/** Fuente de números aleatorios en [0, 1). */
export type Random = () => number;

/**
 * Generador pseudoaleatorio con semilla (mulberry32). Con la misma semilla
 * produce siempre la misma secuencia, lo que permite repetir una simulación.
 * Sin semilla usa `Math.random`.
 */
export function createRandom(seed?: number): Random {
  if (seed === undefined) {
    return Math.random;
  }
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
