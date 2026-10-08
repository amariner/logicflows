import { stopLabel } from '../history/history-view';
import type { SiteComparison } from './comparison.types';

const BOM = '﻿';
const SEPARATOR = ';';

const HEADER = [
  'Célula',
  'Cajas',
  'Palés',
  'Tiempo total (s)',
  'Tiempo de turno (s)',
  'Sin datos (s)',
  'Fuera de producción (s)',
  'Planificado (s)',
  'En producción (s)',
  'Paradas (s)',
  'Disponibilidad (%)',
  'Rendimiento (%)',
  'Parada principal',
  'Parada principal (s)',
];

const percent = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});
const ratio = (value: number | null) => (value === null ? '' : percent.format(value * 100));

/**
 * La comparación como CSV, con el mismo formato que el del histórico (LF-88):
 * una fila por célula, separador `;`, decimales con coma y UTF-8 con BOM.
 */
export function toComparisonCsv(comparison: SiteComparison): string {
  const rows = comparison.cells.map(({ cellId, summary }) => {
    const [main] = summary.stops;
    return [
      cellId,
      summary.boxes,
      summary.pallets,
      summary.seconds.total,
      summary.seconds.shift,
      summary.seconds.noData,
      summary.seconds.outOfProduction,
      summary.seconds.planned,
      summary.seconds.running,
      summary.seconds.stopped,
      ratio(summary.availability),
      ratio(summary.performance),
      main === undefined ? '' : stopLabel(main),
      main === undefined ? '' : main.seconds,
    ].join(SEPARATOR);
  });
  return `${BOM}${[HEADER.join(SEPARATOR), ...rows].join('\r\n')}\r\n`;
}

/** Nombre del fichero: `comparacion-demo-2026-10-05-2026-10-06.csv`, en fechas UTC del periodo. */
export function comparisonCsvName(comparison: SiteComparison): string {
  return `comparacion-${comparison.siteId}-${comparison.from.slice(0, 10)}-${comparison.to.slice(0, 10)}.csv`;
}
