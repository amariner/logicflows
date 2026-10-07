import type { TelemetryMessage } from '@logicflows/contract';

import { CONVEYOR_LABELS, ROBOT_LABELS } from '../../ui/presentation';
import type { Tone } from '../../ui/presentation';

/** Una pieza de la célula en el esquema: su nombre, su estado y su tono. */
export interface SchematicPart {
  readonly name: string;
  readonly label: string;
  readonly tone: Tone;
}

/** El palé en curso, capa a capa. */
export interface SchematicPallet {
  readonly layers: number;
  readonly currentLayer: number;
  /** Avance de la capa en curso, de 0 a 1. */
  readonly layerProgress: number;
  readonly label: string;
}

/** Esquema de una célula: cinta → robot → palé (LF-106). */
export interface CellSchematic {
  readonly conveyor: SchematicPart;
  readonly robot: SchematicPart;
  readonly pallet: SchematicPallet;
}

const TONES = {
  IDLE: 'neutral',
  STOPPED: 'neutral',
  MOVING: 'ok',
  RUNNING: 'ok',
  FAULT: 'danger',
} as const;

/**
 * Prepara el esquema de la célula a partir de su última telemetría. Una
 * avería se marca en rojo; lo normal, parado o en marcha, no destaca (ISA-101).
 */
export function toSchematic(telemetry: TelemetryMessage | null): CellSchematic | null {
  if (telemetry === null) {
    return null;
  }
  const { currentLayer, layersPerPallet, boxesInLayer, boxesPerLayer } = telemetry.pallet;
  const conveyor = {
    name: 'Cinta',
    label: CONVEYOR_LABELS[telemetry.conveyor.state],
    tone: TONES[telemetry.conveyor.state],
  };
  const robot = {
    name: 'Robot',
    label: ROBOT_LABELS[telemetry.robot.state],
    tone: TONES[telemetry.robot.state],
  };
  const pallet = {
    layers: layersPerPallet,
    currentLayer: Math.min(currentLayer, layersPerPallet),
    layerProgress: boxesPerLayer > 0 ? Math.min(1, boxesInLayer / boxesPerLayer) : 0,
    label: `capa ${String(currentLayer)} de ${String(layersPerPallet)}, ${String(boxesInLayer)} de ${String(boxesPerLayer)} cajas`,
  };
  return { conveyor, robot, pallet };
}
