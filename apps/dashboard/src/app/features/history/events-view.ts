import {
  SEVERITY_PRESENTATION,
  STATE_PRESENTATION,
  WAITING_REASON_LABELS,
} from '../../ui/presentation';
import type { Tone } from '../../ui/presentation';
import { formatDuration } from './history-view';
import type { CellEvents } from './history.types';

export interface EventAlarmView {
  readonly code: string;
  readonly message: string;
  readonly severityLabel: string;
  readonly icon: string;
  readonly tone: Tone;
}

/** Una entrada del registro, preparada para la interfaz. */
export interface EventView {
  readonly key: string;
  /** Fecha y hora locales, como «5 oct, 14:20». */
  readonly time: string;
  readonly datetime: string;
  readonly label: string;
  readonly icon: string;
  readonly tone: Tone;
  /** «durante 25 min», «en curso» o null. */
  readonly duration: string | null;
  readonly alarms: readonly EventAlarmView[];
}

export interface EventsView {
  readonly items: readonly EventView[];
  /** Aviso cuando el periodo tiene más eventos de los que se muestran. */
  readonly truncatedNote: string | null;
}

const CONNECTION = {
  online: { label: 'Conectada', icon: 'cloud-done-sharp', tone: 'ok' },
  offline: { label: 'Desconectada', icon: 'cloud-offline-sharp', tone: 'danger' },
} as const satisfies Record<string, { label: string; icon: string; tone: Tone }>;

export function toEventsView(events: CellEvents, timeZone: string): EventsView {
  const format = new Intl.DateTimeFormat('es-ES', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const items = events.events.map((event, index): EventView => {
    const common = {
      key: `${event.at}-${event.kind}-${String(index)}`,
      time: format.format(new Date(event.at)),
      datetime: event.at,
    };
    if (event.kind === 'acknowledgement') {
      const acknowledgement = event.acknowledgement;
      return {
        ...common,
        label:
          acknowledgement === null || acknowledgement === undefined
            ? 'Alarma reconocida'
            : `${acknowledgement.code} reconocida por ${acknowledgement.acknowledgedBy}`,
        icon: 'checkmark-done-sharp',
        tone: 'info',
        duration: null,
        alarms: [],
      };
    }
    if (event.kind === 'connection') {
      const presentation = event.online === true ? CONNECTION.online : CONNECTION.offline;
      return { ...common, ...presentation, duration: null, alarms: [] };
    }
    const state = event.state ?? 'STOPPED';
    const presentation = STATE_PRESENTATION[state];
    const reason =
      event.waitingReason === null ? '' : ` · ${WAITING_REASON_LABELS[event.waitingReason]}`;
    return {
      ...common,
      label: `${presentation.label}${reason}`,
      icon: presentation.icon,
      tone: presentation.tone,
      duration:
        event.durationSeconds === null
          ? 'en curso'
          : `durante ${formatDuration(event.durationSeconds)}`,
      alarms: [...event.alarms]
        .sort(
          (a, b) => SEVERITY_PRESENTATION[a.severity].rank - SEVERITY_PRESENTATION[b.severity].rank,
        )
        .map((alarm) => ({
          code: alarm.code,
          message: alarm.message,
          severityLabel: SEVERITY_PRESENTATION[alarm.severity].label,
          icon: SEVERITY_PRESENTATION[alarm.severity].icon,
          tone: SEVERITY_PRESENTATION[alarm.severity].tone,
        })),
    };
  });
  return {
    items,
    truncatedNote: events.truncated
      ? `Se muestran los ${String(items.length)} eventos más recientes del periodo.`
      : null,
  };
}
