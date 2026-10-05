import type { CellHistory } from './history.types';

/** Marca de orden de bytes: las hojas de cálculo reconocen así el UTF-8. */
const BOM = '﻿';
const SEPARATOR = ';';

const HEADER = [
  'Desde',
  'Hasta',
  'Cajas',
  'Palés',
  'Tiempo total (s)',
  'Sin datos (s)',
  'Fuera de producción (s)',
  'Planificado (s)',
  'En producción (s)',
  'Paradas (s)',
  'Disponibilidad (%)',
  'Rendimiento (%)',
];

const percent = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

/** Fecha y hora locales sin ambigüedad para una hoja de cálculo: `2026-10-05 08:00`. */
function localDateTime(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']} ${parts['hour']}:${parts['minute']}`;
}

const ratio = (value: number | null) => (value === null ? '' : percent.format(value * 100));

/**
 * El histórico como CSV para una hoja de cálculo en español (LF-88): una
 * fila por hora o por día, separador `;`, decimales con coma y UTF-8 con BOM.
 * Los indicadores sin definir quedan vacíos.
 */
export function toHistoryCsv(history: CellHistory): string {
  const rows = history.periods.map((period) =>
    [
      localDateTime(period.from, history.timeZone),
      localDateTime(period.to, history.timeZone),
      period.boxes,
      period.pallets,
      period.seconds.total,
      period.seconds.noData,
      period.seconds.outOfProduction,
      period.seconds.planned,
      period.seconds.running,
      period.seconds.stopped,
      ratio(period.availability),
      ratio(period.performance),
    ].join(SEPARATOR),
  );
  return `${BOM}${[HEADER.join(SEPARATOR), ...rows].join('\r\n')}\r\n`;
}

/** Nombre del fichero: `historico-demo-cell-01-2026-10-05.csv`. */
export function historyCsvName(history: CellHistory): string {
  const day = localDateTime(history.from, history.timeZone).slice(0, 10);
  const unit = history.resolution === 'hour' ? 'horas' : 'dias';
  return `historico-${history.siteId}-${history.cellId}-${day}-${unit}.csv`;
}
