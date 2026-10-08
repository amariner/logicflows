import { parseTime } from './daily-script.ts';
import type { DailyScript, ScriptedIncident } from './daily-script.ts';

const MINUTES_PER_DAY = 1_440;

/**
 * Lo que distingue a una célula de las demás del mismo proceso (LF-123): con
 * el mismo guion y el mismo ritmo, todas se pararían a la vez y darían los
 * mismos indicadores, y comparar células no enseñaría nada.
 */
export interface CellProfile {
  /** Minutos que se adelanta su guion respecto al de la primera célula. */
  readonly scriptOffsetMinutes: number;
  /** Factor de la duración de sus esperas y pausas: más de 1, más largas. */
  readonly stopDurationFactor: number;
  /** Factor de su tiempo de ciclo: más de 1, más lenta que el ritmo nominal. */
  readonly cycleFactor: number;
}

/**
 * Perfiles fijos, para que la demo sea la misma cada día y en cada arranque.
 * La primera célula es la de siempre; las demás se desfasan y se degradan poco
 * a poco, de modo que la comparación tenga una mejor y una peor claras.
 */
export const CELL_PROFILES: readonly CellProfile[] = [
  { scriptOffsetMinutes: 0, stopDurationFactor: 1, cycleFactor: 1 },
  { scriptOffsetMinutes: 23, stopDurationFactor: 0.5, cycleFactor: 1.04 },
  { scriptOffsetMinutes: 41, stopDurationFactor: 1.6, cycleFactor: 1.1 },
  { scriptOffsetMinutes: 67, stopDurationFactor: 2.2, cycleFactor: 1.2 },
];

/** Perfil de la célula en esa posición; a partir de la quinta se repiten desfasados. */
export function cellProfile(index: number): CellProfile {
  const base = CELL_PROFILES[index % CELL_PROFILES.length];
  if (base === undefined) {
    throw new Error('No hay perfiles de célula');
  }
  const round = Math.floor(index / CELL_PROFILES.length);
  return { ...base, scriptOffsetMinutes: base.scriptOffsetMinutes + round * 7 };
}

const formatTime = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/**
 * El guion de una célula con su perfil: cada incidencia, unos minutos más
 * tarde (dando la vuelta a medianoche), y las esperas y pausas más largas o
 * más cortas. Los fallos y las paradas de emergencia no tienen duración en el
 * guion: los resuelve el operario con los tiempos del simulador.
 */
export function scriptForCell(script: DailyScript, profile: CellProfile): DailyScript {
  const incidents = script.incidents.map((incident): ScriptedIncident => {
    const at = formatTime((parseTime(incident.at) + profile.scriptOffsetMinutes) % MINUTES_PER_DAY);
    return incident.kind === 'starved' || incident.kind === 'blocked' || incident.kind === 'pause'
      ? {
          ...incident,
          at,
          minutes: Math.max(1, Math.round(incident.minutes * profile.stopDurationFactor)),
        }
      : { ...incident, at };
  });
  return { ...script, incidents };
}

/** Semilla de una célula: distinta en cada una y repetible con la del proceso. */
export const cellSeed = (seed: number | undefined, index: number): number | undefined =>
  seed === undefined ? undefined : seed + index;
