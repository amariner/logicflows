import type { AlarmSeverity } from '@logicflows/contract';

import type { CellHistory, PeriodIndicators, Resolution, StopCause } from './history.types';

const MISSING = '—';
const integer = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 });

/** Una barra del gráfico de producción. */
export interface Bar {
  /** Etiqueta corta, para el eje. */
  readonly label: string;
  /** Etiqueta completa, para la tabla y los lectores de pantalla. */
  readonly longLabel: string;
  readonly boxes: string;
  /** Altura relativa a la barra más alta, de 0 a 1. */
  readonly ratio: number;
  readonly availability: string;
  readonly performance: string;
}

export interface StopView {
  readonly label: string;
  readonly duration: string;
  readonly count: string;
  /** Duración relativa a la parada más larga, de 0 a 1. */
  readonly ratio: number;
}

/** Histórico preparado para la interfaz (docs/indicadores-de-planta.md). */
export interface HistoryView {
  readonly availability: string;
  readonly performance: string;
  readonly boxes: string;
  readonly pallets: string;
  readonly running: string;
  readonly planned: string;
  readonly noData: string;
  readonly nominal: string;
  /** Alarmas activadas en el periodo, de más a menos grave: «2 altas · 1 media». */
  readonly alarms: string;
  /** No hay ningún dato en todo el periodo. */
  readonly empty: boolean;
  readonly chartTitle: string;
  /** Resumen del gráfico para lectores de pantalla. */
  readonly chartSummary: string;
  /** Máximo del eje: la barra más alta. */
  readonly chartMax: string;
  readonly bars: readonly Bar[];
  readonly stops: readonly StopView[];
}

const STOP_LABELS: Readonly<Record<StopCause, string>> = {
  STARTING: 'Arranque',
  PAUSED: 'Pausa del operario',
  STARVED: 'Sin cajas a la entrada',
  BLOCKED: 'Salida ocupada',
  FAULT: 'Fallo',
  EMERGENCY_STOP: 'Parada de emergencia',
};

const SEVERITY_NAMES: readonly [AlarmSeverity, string, string][] = [
  ['CRITICAL', 'crítica', 'críticas'],
  ['HIGH', 'alta', 'altas'],
  ['MEDIUM', 'media', 'medias'],
  ['LOW', 'baja', 'bajas'],
];

/** Alarmas por gravedad, como «2 altas · 1 media»; sin ninguna, «ninguna». */
export function formatAlarms(alarms: Readonly<Record<AlarmSeverity, number>>): string {
  const parts = SEVERITY_NAMES.filter(([severity]) => alarms[severity] > 0).map(
    ([severity, one, many]) =>
      `${integer.format(alarms[severity])} ${alarms[severity] === 1 ? one : many}`,
  );
  return parts.length === 0 ? 'ninguna' : parts.join(' · ');
}

/** Una fracción como porcentaje; sin definir, «—». */
export const formatRatio = (value: number | null): string =>
  value === null ? MISSING : percent.format(value);

/** Una duración en horas y minutos, o en segundos si no llega al minuto. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${integer.format(seconds)} s`;
  }
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${String(rest)} min`;
  }
  return rest === 0
    ? `${integer.format(hours)} h`
    : `${integer.format(hours)} h ${String(rest)} min`;
}

function labels(resolution: Resolution, timeZone: string) {
  if (resolution === 'hour') {
    const time = new Intl.DateTimeFormat('es-ES', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    return {
      short: (period: PeriodIndicators) => time.format(new Date(period.from)),
      long: (period: PeriodIndicators) =>
        `De ${time.format(new Date(period.from))} a ${time.format(new Date(period.to))}`,
    };
  }
  const short = new Intl.DateTimeFormat('es-ES', { timeZone, day: 'numeric', month: 'numeric' });
  const long = new Intl.DateTimeFormat('es-ES', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return {
    short: (period: PeriodIndicators) => short.format(new Date(period.from)),
    long: (period: PeriodIndicators) => {
      const text = long.format(new Date(period.from));
      return text.charAt(0).toUpperCase() + text.slice(1);
    },
  };
}

export function toHistoryView(history: CellHistory): HistoryView {
  const { summary, periods, resolution, timeZone } = history;
  const label = labels(resolution, timeZone);
  const maxBoxes = Math.max(0, ...periods.map((period) => period.boxes));
  const bars = periods.map((period) => ({
    label: label.short(period),
    longLabel: label.long(period),
    boxes: integer.format(period.boxes),
    ratio: maxBoxes === 0 ? 0 : period.boxes / maxBoxes,
    availability: formatRatio(period.availability),
    performance: formatRatio(period.performance),
  }));
  const busiest = periods.find((period) => period.boxes === maxBoxes);
  const unit = resolution === 'hour' ? 'hora' : 'día';
  const busiestLabel = resolution === 'hour' ? 'La hora' : 'El día';
  const chartSummary =
    busiest === undefined || maxBoxes === 0
      ? `Sin producción en el periodo.`
      : `${integer.format(summary.boxes)} cajas en total. ${busiestLabel} con más producción: ${label
          .long(busiest)
          .toLowerCase()}, con ${integer.format(maxBoxes)} cajas.`;
  const longest = Math.max(0, ...summary.stops.map((stop) => stop.seconds));
  return {
    availability: formatRatio(summary.availability),
    performance: formatRatio(summary.performance),
    boxes: integer.format(summary.boxes),
    pallets: integer.format(summary.pallets),
    running: formatDuration(summary.seconds.running),
    planned: formatDuration(summary.seconds.planned),
    noData: formatDuration(summary.seconds.noData),
    nominal: `${integer.format(history.nominalBoxesPerHour)} cajas/h`,
    alarms: formatAlarms(summary.alarms),
    empty: summary.seconds.noData >= summary.seconds.total,
    chartTitle: `Cajas por ${unit}`,
    chartSummary,
    chartMax: `${integer.format(maxBoxes)} cajas`,
    bars,
    stops: summary.stops.map((stop) => ({
      label:
        stop.cause === 'FAULT' && stop.alarmCode !== null
          ? `${STOP_LABELS.FAULT} ${stop.alarmCode}`
          : STOP_LABELS[stop.cause],
      duration: formatDuration(stop.seconds),
      count: stop.count === 1 ? '1 vez' : `${integer.format(stop.count)} veces`,
      ratio: longest === 0 ? 0 : stop.seconds / longest,
    })),
  };
}
