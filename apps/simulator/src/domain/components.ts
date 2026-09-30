import type { ActiveAlarm } from './alarms.ts';
import type { CellStatus } from './cell.ts';

export type RobotState = 'IDLE' | 'MOVING' | 'FAULT';
export type ConveyorState = 'STOPPED' | 'RUNNING' | 'FAULT';

export interface ComponentStates {
  readonly robot: RobotState;
  readonly conveyor: ConveyorState;
}

/**
 * Estado del robot y de la cinta que corresponde al estado de la célula y a
 * sus alarmas activas: en FAULT solo marca como averiado el componente que ha
 * fallado.
 */
export function componentStates(
  { state, waitingReason }: CellStatus,
  alarms: readonly ActiveAlarm[] = [],
): ComponentStates {
  switch (state) {
    case 'STARTING':
      return { robot: 'MOVING', conveyor: 'STOPPED' };
    case 'RUNNING':
      return { robot: 'MOVING', conveyor: 'RUNNING' };
    case 'WAITING':
      // Sin cajas la cinta sigue en marcha esperando; con la salida ocupada se detiene.
      return { robot: 'IDLE', conveyor: waitingReason === 'STARVED' ? 'RUNNING' : 'STOPPED' };
    case 'FAULT':
      return {
        robot: alarms.some((alarm) => alarm.source === 'robot') ? 'FAULT' : 'IDLE',
        conveyor: alarms.some((alarm) => alarm.source === 'conveyor') ? 'FAULT' : 'STOPPED',
      };
    case 'STOPPED':
    case 'PAUSED':
    case 'EMERGENCY_STOP':
      return { robot: 'IDLE', conveyor: 'STOPPED' };
  }
}
