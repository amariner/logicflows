/** Formato del pallet: capas por pallet y cajas por capa. */
export interface PalletFormat {
  readonly layersPerPallet: number;
  readonly boxesPerLayer: number;
}

/** Contadores de producción de la célula. */
export interface ProductionCounters {
  /** Cajas paletizadas desde que arrancó el simulador. Solo crece. */
  readonly boxesTotal: number;
  /** Pallets completados desde que arrancó el simulador. Solo crece. */
  readonly palletsTotal: number;
  /** Capa en curso del pallet actual, empezando en 1. */
  readonly currentLayer: number;
  /** Cajas ya colocadas en la capa en curso. */
  readonly boxesInLayer: number;
}

export const INITIAL_COUNTERS: ProductionCounters = {
  boxesTotal: 0,
  palletsTotal: 0,
  currentLayer: 1,
  boxesInLayer: 0,
};

/**
 * Coloca una caja: completa la capa al llegar a `boxesPerLayer` y el pallet
 * al completar su última capa, momento en que empieza un pallet nuevo.
 */
export function placeBox(counters: ProductionCounters, format: PalletFormat): ProductionCounters {
  const boxesTotal = counters.boxesTotal + 1;
  const boxesInLayer = counters.boxesInLayer + 1;

  if (boxesInLayer < format.boxesPerLayer) {
    return { ...counters, boxesTotal, boxesInLayer };
  }
  if (counters.currentLayer < format.layersPerPallet) {
    return { ...counters, boxesTotal, currentLayer: counters.currentLayer + 1, boxesInLayer: 0 };
  }
  return { boxesTotal, palletsTotal: counters.palletsTotal + 1, currentLayer: 1, boxesInLayer: 0 };
}
