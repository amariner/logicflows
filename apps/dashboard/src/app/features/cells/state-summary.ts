import type { CellState } from '@logicflows/contract';

import { STATE_PRESENTATION } from '../../ui/presentation';
import type { Tone } from '../../ui/presentation';
import type { CellView } from './cell-view';

/** Cuántas células hay en un estado, como «2 produciendo». */
export interface StateCount {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly tone: Tone;
  readonly count: number;
}

/** De lo más grave a lo normal: lo que requiere atención va primero. */
const ORDER: readonly CellState[] = [
  'EMERGENCY_STOP',
  'FAULT',
  'WAITING',
  'STARTING',
  'RUNNING',
  'PAUSED',
  'STOPPED',
];

/** Resumen de los estados del panel; solo aparecen los que tiene alguna célula. */
export function summarizeStates(cells: readonly CellView[]): StateCount[] {
  const counts = new Map<CellState | null, number>();
  for (const cell of cells) {
    counts.set(cell.state, (counts.get(cell.state) ?? 0) + 1);
  }
  const summary: StateCount[] = ORDER.flatMap((state) => {
    const count = counts.get(state) ?? 0;
    const { label, icon, tone } = STATE_PRESENTATION[state];
    return count === 0
      ? []
      : [{ key: state, label: `${String(count)} ${label.toLowerCase()}`, icon, tone, count }];
  });
  const unknown = counts.get(null) ?? 0;
  if (unknown > 0) {
    summary.push({
      key: 'UNKNOWN',
      label: `${String(unknown)} sin datos`,
      icon: 'help-circle-sharp',
      tone: 'neutral',
      count: unknown,
    });
  }
  return summary;
}
