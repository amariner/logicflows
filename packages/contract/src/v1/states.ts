import { z } from 'zod';

/** Estados de la célula de paletizado (ADR-0003). */
export const CELL_STATES = [
  'STOPPED',
  'STARTING',
  'RUNNING',
  'WAITING',
  'PAUSED',
  'FAULT',
  'EMERGENCY_STOP',
] as const;
export type CellState = (typeof CELL_STATES)[number];
export const cellStateSchema = z.enum(CELL_STATES);

/** Causa de una espera: sin cajas a la entrada o salida de palés ocupada. */
export const WAITING_REASONS = ['STARVED', 'BLOCKED'] as const;
export type WaitingReason = (typeof WAITING_REASONS)[number];
export const waitingReasonSchema = z.enum(WAITING_REASONS);

/** Eventos que provocan las transiciones de estado (ADR-0003). */
export const CELL_EVENTS = [
  'start',
  'started',
  'starved',
  'blocked',
  'supplyRestored',
  'pause',
  'resume',
  'stop',
  'fault',
  'reset',
  'emergencyStop',
] as const;
export type CellEvent = (typeof CELL_EVENTS)[number];
export const cellEventSchema = z.enum(CELL_EVENTS);

export interface Transition {
  readonly event: CellEvent;
  readonly from: readonly CellState[];
  readonly to: readonly CellState[];
}

const allExcept = (...excluded: CellState[]): CellState[] =>
  CELL_STATES.filter((state) => !excluded.includes(state));

/** Tabla de transiciones previstas de ADR-0003. */
export const TRANSITIONS: readonly Transition[] = [
  { event: 'start', from: ['STOPPED'], to: ['STARTING'] },
  { event: 'started', from: ['STARTING'], to: ['RUNNING'] },
  { event: 'starved', from: ['RUNNING'], to: ['WAITING'] },
  { event: 'blocked', from: ['RUNNING'], to: ['WAITING'] },
  { event: 'supplyRestored', from: ['WAITING'], to: ['RUNNING'] },
  { event: 'pause', from: ['RUNNING', 'WAITING'], to: ['PAUSED'] },
  { event: 'resume', from: ['PAUSED'], to: ['RUNNING'] },
  { event: 'stop', from: ['STARTING', 'RUNNING', 'WAITING', 'PAUSED'], to: ['STOPPED'] },
  { event: 'fault', from: allExcept('FAULT', 'EMERGENCY_STOP'), to: ['FAULT'] },
  { event: 'reset', from: ['FAULT'], to: ['STOPPED'] },
  { event: 'emergencyStop', from: allExcept('EMERGENCY_STOP'), to: ['EMERGENCY_STOP'] },
  { event: 'reset', from: ['EMERGENCY_STOP'], to: ['STOPPED', 'FAULT'] },
];

/** Indica si ADR-0003 prevé pasar de `from` a `to` mediante algún evento. */
export function isExpectedTransition(from: CellState, to: CellState): boolean {
  return TRANSITIONS.some(
    (transition) => transition.from.includes(from) && transition.to.includes(to),
  );
}

/** Estados a los que puede llevar un evento desde un estado. Vacío si el evento no aplica. */
export function targetStates(from: CellState, event: CellEvent): readonly CellState[] {
  return TRANSITIONS.filter(
    (transition) => transition.event === event && transition.from.includes(from),
  ).flatMap((transition) => transition.to);
}
