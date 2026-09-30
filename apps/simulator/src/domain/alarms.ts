import type { AlarmSeverity } from '@logicflows/contract';

/** Parte de la célula a la que afecta una alarma. */
export type AlarmSource = 'robot' | 'conveyor' | 'safety' | 'supply';

export interface AlarmDefinition {
  readonly code: string;
  readonly severity: AlarmSeverity;
  readonly message: string;
  readonly source: AlarmSource;
}

export interface ActiveAlarm extends AlarmDefinition {
  readonly raisedAtMs: number;
}

/** Catálogo de alarmas de la célula simulada. */
export const ALARMS = {
  robotCollision: {
    code: 'ROB-001',
    severity: 'HIGH',
    message: 'Colisión del robot detectada',
    source: 'robot',
  },
  gripperVacuumLoss: {
    code: 'ROB-002',
    severity: 'HIGH',
    message: 'Pérdida de vacío en la pinza',
    source: 'robot',
  },
  conveyorJam: {
    code: 'CONV-002',
    severity: 'MEDIUM',
    message: 'Atasco en la cinta de entrada',
    source: 'conveyor',
  },
  emergencyStop: {
    code: 'SAF-001',
    severity: 'CRITICAL',
    message: 'Parada de emergencia activada',
    source: 'safety',
  },
  starved: {
    code: 'CONV-001',
    severity: 'LOW',
    message: 'Sin cajas en la entrada',
    source: 'supply',
  },
  blocked: {
    code: 'OUT-001',
    severity: 'LOW',
    message: 'Salida de pallets ocupada',
    source: 'supply',
  },
} as const satisfies Record<string, AlarmDefinition>;

/** Alarmas que detienen la célula en FAULT. */
export const FAULT_ALARMS: readonly AlarmDefinition[] = [
  ALARMS.robotCollision,
  ALARMS.gripperVacuumLoss,
  ALARMS.conveyorJam,
];

export const isFaultAlarm = (alarm: AlarmDefinition): boolean =>
  alarm.source === 'robot' || alarm.source === 'conveyor';
