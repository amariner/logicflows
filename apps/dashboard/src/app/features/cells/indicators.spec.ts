import { buildTelemetryMessage } from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { EMPTY_INDICATORS, toIndicators } from './indicators';

describe('indicadores de producción', () => {
  it('sin telemetría muestra guiones, nunca ceros', () => {
    expect(toIndicators(null)).toEqual(EMPTY_INDICATORS);
    expect(EMPTY_INDICATORS.boxes).toBe('—');
  });

  it('formatea cada indicador con su unidad', () => {
    const indicators = toIndicators(
      buildTelemetryMessage({
        boxesTotal: 15234,
        palletsTotal: 1312,
        pallet: { currentLayer: 3, layersPerPallet: 5, boxesInLayer: 4, boxesPerLayer: 8 },
        throughputBoxesPerHour: 819.6,
        cycleTimeMs: 4250,
      }),
    );
    expect(indicators).toEqual({
      boxes: '15.234',
      pallets: '1312',
      layer: '3 de 5',
      palletProgress: 20 / 40,
      palletProgressLabel: 'Pallet en curso: 20 de 40 cajas',
      throughput: { value: '820', unit: 'cajas/h' },
      cycleTime: { value: '4,3', unit: 's' },
    });
  });

  it('muestra un guion como tiempo de ciclo antes del primer ciclo completo', () => {
    expect(toIndicators(buildTelemetryMessage({ cycleTimeMs: null })).cycleTime).toEqual({
      value: '—',
      unit: '',
    });
  });

  it('el avance del pallet empieza en cero y llega al total en la última capa', () => {
    const progress = (currentLayer: number, boxesInLayer: number) =>
      toIndicators(
        buildTelemetryMessage({
          pallet: { currentLayer, layersPerPallet: 5, boxesInLayer, boxesPerLayer: 8 },
        }),
      ).palletProgress;
    expect(progress(1, 0)).toBe(0);
    expect(progress(5, 8)).toBe(1);
  });
});
