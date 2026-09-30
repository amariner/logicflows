import type { CellStatus } from './cell.ts';

export type RobotState = 'IDLE' | 'MOVING' | 'FAULT';
export type ConveyorState = 'STOPPED' | 'RUNNING' | 'FAULT';

export interface ComponentStates {
  readonly robot: RobotState;
  readonly conveyor: ConveyorState;
}

/** Estado del robot y de la cinta que corresponde al estado de la célula. */
export function componentStates({ state, waitingReason }: CellStatus): ComponentStates {
  switch (state) {
    case 'STARTING':
      return { robot: 'MOVING', conveyor: 'STOPPED' };
    case 'RUNNING':
      return { robot: 'MOVING', conveyor: 'RUNNING' };
    case 'WAITING':
      // Sin cajas la cinta sigue en marcha esperando; con la salida ocupada se detiene.
      return { robot: 'IDLE', conveyor: waitingReason === 'STARVED' ? 'RUNNING' : 'STOPPED' };
    case 'FAULT':
      return { robot: 'FAULT', conveyor: 'STOPPED' };
    case 'STOPPED':
    case 'PAUSED':
    case 'EMERGENCY_STOP':
      return { robot: 'IDLE', conveyor: 'STOPPED' };
  }
}
