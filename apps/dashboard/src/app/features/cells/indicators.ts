import type { TelemetryMessage } from '@logicflows/contract';

const integer = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Valor con su unidad, que se muestra más pequeña. */
export interface Measure {
  readonly value: string;
  readonly unit: string;
}

/** Indicadores de producción preparados para la interfaz (docs/diseno-del-visor.md). */
export interface ProductionIndicators {
  readonly boxes: string;
  readonly pallets: string;
  readonly layer: string;
  /** Avance del pallet en curso, de 0 a 1. */
  readonly palletProgress: number;
  readonly palletProgressLabel: string;
  readonly throughput: Measure;
  readonly cycleTime: Measure;
}

const MISSING = '—';

export const EMPTY_INDICATORS: ProductionIndicators = {
  boxes: MISSING,
  pallets: MISSING,
  layer: MISSING,
  palletProgress: 0,
  palletProgressLabel: 'Sin datos del pallet en curso',
  throughput: { value: MISSING, unit: '' },
  cycleTime: { value: MISSING, unit: '' },
};

export function toIndicators(telemetry: TelemetryMessage | null): ProductionIndicators {
  if (telemetry === null) {
    return EMPTY_INDICATORS;
  }
  const { currentLayer, layersPerPallet, boxesInLayer, boxesPerLayer } = telemetry.pallet;
  const boxesPerPallet = layersPerPallet * boxesPerLayer;
  const boxesInPallet = (currentLayer - 1) * boxesPerLayer + boxesInLayer;
  const palletProgress = Math.min(1, boxesInPallet / boxesPerPallet);

  return {
    boxes: integer.format(telemetry.boxesTotal),
    pallets: integer.format(telemetry.palletsTotal),
    layer: `${String(currentLayer)} de ${String(layersPerPallet)}`,
    palletProgress,
    palletProgressLabel: `Pallet en curso: ${integer.format(boxesInPallet)} de ${integer.format(boxesPerPallet)} cajas`,
    throughput: { value: integer.format(telemetry.throughputBoxesPerHour), unit: 'cajas/h' },
    cycleTime:
      telemetry.cycleTimeMs === null
        ? { value: MISSING, unit: '' }
        : { value: oneDecimal.format(telemetry.cycleTimeMs / 1_000), unit: 's' },
  };
}
