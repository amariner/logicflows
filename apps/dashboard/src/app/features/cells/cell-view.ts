import type { CellSnapshot, CellState } from '@logicflows/contract';

import { toIndicators } from './indicators';
import type { ProductionIndicators } from './indicators';
import {
  CONVEYOR_LABELS,
  ROBOT_LABELS,
  SEVERITY_PRESENTATION,
  STATE_PRESENTATION,
  WAITING_REASON_LABELS,
} from '../../ui/presentation';
import type { Tone } from '../../ui/presentation';

const defaultTimeFormat = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

/** Formatea la hora de un instante ISO 8601. Sustituible en las pruebas. */
export type TimeFormatter = (iso: string) => string;
const formatTime: TimeFormatter = (iso) => defaultTimeFormat.format(new Date(iso));

export interface AlarmView {
  readonly code: string;
  readonly message: string;
  readonly severityLabel: string;
  readonly icon: string;
  readonly tone: Tone;
  /** «desde las 08:30». */
  readonly sinceLabel: string;
}

/** Datos de una célula preparados para la interfaz. */
export interface CellView {
  readonly id: string;
  readonly siteId: string;
  readonly cellId: string;
  /** `null` si todavía no se sabe si la célula está conectada. */
  readonly online: boolean | null;
  readonly state: CellState | null;
  readonly stateLabel: string;
  readonly stateIcon: string;
  readonly stateTone: Tone;
  readonly attention: boolean;
  /** Alarmas activas, de más a menos grave. */
  readonly alarms: readonly AlarmView[];
  readonly boxesTotal: number | null;
  readonly indicators: ProductionIndicators;
  /** «Robot: en movimiento · Cinta: en marcha», o `null` sin telemetría. */
  readonly componentsLabel: string | null;
}

export function toCellView(snapshot: CellSnapshot, time: TimeFormatter = formatTime): CellView {
  const { siteId, cellId, status, state, telemetry } = snapshot;

  let stateLabel = 'Sin datos';
  let stateIcon = 'help-circle-sharp';
  let stateTone: Tone = 'neutral';
  let attention = false;
  if (state !== null) {
    const presentation = STATE_PRESENTATION[state.state];
    const reason =
      state.waitingReason === null ? '' : ` · ${WAITING_REASON_LABELS[state.waitingReason]}`;
    stateLabel = `${presentation.label}${reason}`;
    stateIcon = presentation.icon;
    stateTone = presentation.tone;
    attention = presentation.attention;
  }

  const alarms = [...(state?.activeAlarms ?? [])]
    .sort(
      (a, b) =>
        SEVERITY_PRESENTATION[a.severity].rank - SEVERITY_PRESENTATION[b.severity].rank ||
        a.raisedAt.localeCompare(b.raisedAt),
    )
    .map((alarm) => {
      const severity = SEVERITY_PRESENTATION[alarm.severity];
      return {
        code: alarm.code,
        message: alarm.message,
        severityLabel: severity.label,
        icon: severity.icon,
        tone: severity.tone,
        sinceLabel: `desde las ${time(alarm.raisedAt)}`,
      };
    });

  let componentsLabel: string | null = null;
  if (telemetry !== null) {
    componentsLabel = `Robot: ${ROBOT_LABELS[telemetry.robot.state]} · Cinta: ${CONVEYOR_LABELS[telemetry.conveyor.state]}`;
  }

  return {
    id: `${siteId}/${cellId}`,
    siteId,
    cellId,
    online: status?.online ?? null,
    state: state?.state ?? null,
    stateLabel,
    stateIcon,
    stateTone,
    attention,
    alarms,
    boxesTotal: telemetry?.boxesTotal ?? null,
    indicators: toIndicators(telemetry),
    componentsLabel,
  };
}
