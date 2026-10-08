import { describe, expect, it } from 'vitest';

import { cellProfile, cellSeed, CELL_PROFILES, scriptForCell } from './cells.ts';
import { validateScript } from './daily-script.ts';
import type { DailyScript } from './daily-script.ts';
import { GUION_DIARIO } from './guion-diario.ts';

const script: DailyScript = {
  timeZone: 'Europe/Madrid',
  incidents: [
    { at: '06:00', kind: 'pause', minutes: 10 },
    { at: '09:47', kind: 'fault', alarm: 'ROB-002' },
    { at: '23:50', kind: 'starved', minutes: 3 },
  ],
};

describe('perfiles de las células (LF-123)', () => {
  it('la primera célula conserva el guion y el ritmo de siempre', () => {
    const profile = cellProfile(0);
    expect(profile).toEqual({ scriptOffsetMinutes: 0, stopDurationFactor: 1, cycleFactor: 1 });
    expect(scriptForCell(script, profile)).toEqual(script);
  });

  it('desplaza las incidencias, dando la vuelta a medianoche', () => {
    const shifted = scriptForCell(script, {
      scriptOffsetMinutes: 23,
      stopDurationFactor: 1,
      cycleFactor: 1,
    });
    expect(shifted.incidents.map((incident) => incident.at)).toEqual(['06:23', '10:10', '00:13']);
  });

  it('alarga o acorta las esperas y pausas, nunca por debajo de un minuto', () => {
    const longer = scriptForCell(script, {
      scriptOffsetMinutes: 0,
      stopDurationFactor: 2.2,
      cycleFactor: 1,
    });
    expect(longer.incidents[0]).toEqual({ at: '06:00', kind: 'pause', minutes: 22 });
    const shorter = scriptForCell(script, {
      scriptOffsetMinutes: 0,
      stopDurationFactor: 0.1,
      cycleFactor: 1,
    });
    expect(shorter.incidents[2]).toEqual({ at: '23:50', kind: 'starved', minutes: 1 });
    // Los fallos no tienen duración en el guion.
    expect(longer.incidents[1]).toEqual(script.incidents[1]);
  });

  it('el guion de la demo sigue siendo válido con cada perfil', () => {
    for (let index = 0; index < 8; index++) {
      expect(() => {
        validateScript(scriptForCell(GUION_DIARIO, cellProfile(index)));
      }).not.toThrow();
    }
  });

  it('ninguna célula va más rápida que el ritmo nominal', () => {
    for (const profile of CELL_PROFILES) {
      expect(profile.cycleFactor).toBeGreaterThanOrEqual(1);
    }
  });

  it('a partir de la quinta célula repite los perfiles con otro desfase', () => {
    expect(cellProfile(4).cycleFactor).toBe(cellProfile(0).cycleFactor);
    expect(cellProfile(4).scriptOffsetMinutes).not.toBe(cellProfile(0).scriptOffsetMinutes);
  });

  it('da a cada célula su semilla, repetible', () => {
    expect(cellSeed(7, 0)).toBe(7);
    expect(cellSeed(7, 3)).toBe(10);
    expect(cellSeed(undefined, 3)).toBeUndefined();
  });
});
