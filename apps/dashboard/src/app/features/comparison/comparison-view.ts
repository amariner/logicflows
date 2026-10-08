import { formatDuration, formatRatio, stopLabel } from '../history/history-view';
import type { SiteComparison } from './comparison.types';

const integer = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/** Columnas por las que se puede ordenar la comparación. */
export type SortKey = 'cell' | 'boxes' | 'availability' | 'performance';

export interface Sort {
  readonly key: SortKey;
  readonly descending: boolean;
}

/** Una célula en la comparación, preparada para la interfaz. */
export interface ComparisonRow {
  readonly cellId: string;
  readonly boxes: string;
  readonly availability: string;
  readonly performance: string;
  /** «Fallo ROB-001 · 2 h 10 min», o «—» sin paradas. */
  readonly mainStop: string;
  /** La de menor disponibilidad: se señala con texto e icono, no solo con color. */
  readonly worst: boolean;
}

export interface ComparisonView {
  readonly rows: readonly ComparisonRow[];
  /** «cell-04 tiene la menor disponibilidad: 75 %», o null si no hay una peor clara. */
  readonly worstNote: string | null;
  readonly empty: boolean;
}

type Cell = SiteComparison['cells'][number];

const VALUES: Readonly<Record<Exclude<SortKey, 'cell'>, (cell: Cell) => number | null>> = {
  boxes: (cell) => cell.summary.boxes,
  availability: (cell) => cell.summary.availability,
  performance: (cell) => cell.summary.performance,
};

function compare(a: Cell, b: Cell, { key, descending }: Sort): number {
  if (key === 'cell') {
    return descending ? b.cellId.localeCompare(a.cellId) : a.cellId.localeCompare(b.cellId);
  }
  const [x, y] = [VALUES[key](a), VALUES[key](b)];
  // Sin dato, siempre al final, ordene como ordene.
  if (x === null || y === null) {
    return x === y ? a.cellId.localeCompare(b.cellId) : x === null ? 1 : -1;
  }
  return (descending ? y - x : x - y) || a.cellId.localeCompare(b.cellId);
}

/**
 * Las células de una planta, una por fila, ordenadas por la columna elegida.
 * La de menor disponibilidad se señala si hay al menos dos con dato y no
 * empatan.
 */
export function toComparisonView(comparison: SiteComparison, sort: Sort): ComparisonView {
  const measured = comparison.cells.filter((cell) => cell.summary.availability !== null);
  const sorted = [...measured].sort(
    (a, b) => (a.summary.availability ?? 0) - (b.summary.availability ?? 0),
  );
  const [lowest, next] = sorted;
  const worst =
    lowest !== undefined &&
    next !== undefined &&
    (lowest.summary.availability ?? 0) < (next.summary.availability ?? 0)
      ? lowest
      : undefined;

  const rows = [...comparison.cells]
    .sort((a, b) => compare(a, b, sort))
    .map((cell): ComparisonRow => {
      const [main] = cell.summary.stops;
      return {
        cellId: cell.cellId,
        boxes: integer.format(cell.summary.boxes),
        availability: formatRatio(cell.summary.availability),
        performance: formatRatio(cell.summary.performance),
        mainStop: main === undefined ? '—' : `${stopLabel(main)} · ${formatDuration(main.seconds)}`,
        worst: cell.cellId === worst?.cellId,
      };
    });
  return {
    rows,
    worstNote:
      worst === undefined
        ? null
        : `${worst.cellId} tiene la menor disponibilidad: ${formatRatio(worst.summary.availability)}`,
    empty: comparison.cells.every(
      (cell) => cell.summary.seconds.noData >= cell.summary.seconds.total,
    ),
  };
}
