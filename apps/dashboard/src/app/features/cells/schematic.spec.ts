import { buildTelemetryMessage } from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { toSchematic } from './schematic';

describe('esquema de la célula (LF-106)', () => {
  it('sin telemetría no hay esquema', () => {
    expect(toSchematic(null)).toBeNull();
  });

  it('describe la cinta, el robot y el palé en curso', () => {
    const schematic = toSchematic(
      buildTelemetryMessage({
        pallet: { currentLayer: 3, layersPerPallet: 5, boxesInLayer: 4, boxesPerLayer: 8 },
        robot: { state: 'MOVING' },
        conveyor: { state: 'RUNNING' },
      }),
    );
    expect(schematic?.robot).toEqual({ name: 'Robot', label: 'en movimiento', tone: 'ok' });
    expect(schematic?.conveyor.tone).toBe('ok');
    expect(schematic?.pallet).toMatchObject({ layers: 5, currentLayer: 3, layerProgress: 0.5 });
    expect(schematic?.pallet.label).toBe('capa 3 de 5, 4 de 8 cajas');
  });

  it('solo una avería se marca en rojo; parado es normal', () => {
    const schematic = toSchematic(
      buildTelemetryMessage({ robot: { state: 'FAULT' }, conveyor: { state: 'STOPPED' } }),
    );
    expect(schematic?.robot.tone).toBe('danger');
    expect(schematic?.conveyor.tone).toBe('neutral');
  });
});
