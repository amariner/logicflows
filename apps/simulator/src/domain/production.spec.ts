import { describe, expect, it } from 'vitest';

import { INITIAL_COUNTERS, placeBox } from './production.ts';
import type { ProductionCounters } from './production.ts';

const format = { layersPerPallet: 2, boxesPerLayer: 3 };

const placeBoxes = (count: number): ProductionCounters => {
  let counters = INITIAL_COUNTERS;
  for (let i = 0; i < count; i++) {
    counters = placeBox(counters, format);
  }
  return counters;
};

describe('producción', () => {
  it('coloca las cajas en la capa en curso', () => {
    expect(placeBoxes(2)).toEqual({
      boxesTotal: 2,
      palletsTotal: 0,
      currentLayer: 1,
      boxesInLayer: 2,
    });
  });

  it('empieza una capa nueva al completar la anterior', () => {
    expect(placeBoxes(3)).toEqual({
      boxesTotal: 3,
      palletsTotal: 0,
      currentLayer: 2,
      boxesInLayer: 0,
    });
  });

  it('completa el palé con su última capa y empieza uno nuevo', () => {
    expect(placeBoxes(6)).toEqual({
      boxesTotal: 6,
      palletsTotal: 1,
      currentLayer: 1,
      boxesInLayer: 0,
    });
  });

  it('los contadores acumulados solo crecen', () => {
    expect(placeBoxes(13)).toMatchObject({ boxesTotal: 13, palletsTotal: 2 });
  });
});
