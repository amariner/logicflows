import { describe, expect, it } from 'vitest';

import { CELL_STATES, isExpectedTransition, targetStates } from './states.ts';
import type { CellEvent, CellState } from './states.ts';

// Tabla de transiciones de ADR-0003, fila a fila.
const adrTable: [CellEvent, CellState[], CellState[]][] = [
  ['start', ['STOPPED'], ['STARTING']],
  ['started', ['STARTING'], ['RUNNING']],
  ['starved', ['RUNNING'], ['WAITING']],
  ['blocked', ['RUNNING'], ['WAITING']],
  ['supplyRestored', ['WAITING'], ['RUNNING']],
  ['pause', ['RUNNING', 'WAITING'], ['PAUSED']],
  ['resume', ['PAUSED'], ['RUNNING']],
  ['stop', ['STARTING', 'RUNNING', 'WAITING', 'PAUSED'], ['STOPPED']],
  ['fault', ['STOPPED', 'STARTING', 'RUNNING', 'WAITING', 'PAUSED'], ['FAULT']],
  ['reset', ['FAULT'], ['STOPPED']],
  [
    'emergencyStop',
    ['STOPPED', 'STARTING', 'RUNNING', 'WAITING', 'PAUSED', 'FAULT'],
    ['EMERGENCY_STOP'],
  ],
  ['reset', ['EMERGENCY_STOP'], ['STOPPED', 'FAULT']],
];

describe('transiciones de estado', () => {
  describe.each(adrTable)('evento %s', (event, fromStates, expected) => {
    it.each(fromStates)(`desde %s lleva a ${expected.join(' o ')}`, (from) => {
      expect(targetStates(from, event)).toEqual(expected);
      for (const to of expected) {
        expect(isExpectedTransition(from, to)).toBe(true);
      }
    });
  });

  it('la parada de emergencia es posible desde cualquier estado salvo ella misma', () => {
    for (const state of CELL_STATES) {
      const expected = state === 'EMERGENCY_STOP' ? [] : ['EMERGENCY_STOP'];
      expect(targetStates(state, 'emergencyStop')).toEqual(expected);
    }
  });

  it.each<[CellState, CellState]>([
    ['FAULT', 'RUNNING'],
    ['EMERGENCY_STOP', 'RUNNING'],
    ['EMERGENCY_STOP', 'STARTING'],
    ['STOPPED', 'RUNNING'],
    ['PAUSED', 'WAITING'],
    ['FAULT', 'STARTING'],
  ])('no prevé pasar de %s a %s: el rearme nunca pone la célula en marcha', (from, to) => {
    expect(isExpectedTransition(from, to)).toBe(false);
  });

  it('un evento que no aplica al estado actual no lleva a ningún estado', () => {
    expect(targetStates('RUNNING', 'start')).toEqual([]);
    expect(targetStates('STOPPED', 'resume')).toEqual([]);
    expect(targetStates('FAULT', 'fault')).toEqual([]);
  });
});
