import type { CellSnapshot, CellState, WaitingReason } from '@logicflows/contract';

/** Nombre de cada estado de ADR-0003 tal como se muestra al usuario. */
export const STATE_LABELS: Readonly<Record<CellState, string>> = {
  STOPPED: 'Detenida',
  STARTING: 'Arrancando',
  RUNNING: 'Produciendo',
  WAITING: 'En espera',
  PAUSED: 'En pausa',
  FAULT: 'Fallo',
  EMERGENCY_STOP: 'Parada de emergencia',
};

export const WAITING_REASON_LABELS: Readonly<Record<WaitingReason, string>> = {
  STARVED: 'sin cajas',
  BLOCKED: 'salida ocupada',
};

const numberFormat = new Intl.NumberFormat('es-ES');

/** Datos de una célula preparados para la interfaz. */
export interface CellView {
  readonly id: string;
  readonly siteId: string;
  readonly cellId: string;
  /** `null` si todavía no se sabe si la célula está conectada. */
  readonly online: boolean | null;
  readonly state: CellState | null;
  readonly stateLabel: string;
  readonly boxesTotal: number | null;
  readonly boxesLabel: string;
  readonly palletsTotal: number | null;
  readonly palletLabel: string;
}

export function toCellView(snapshot: CellSnapshot): CellView {
  const { siteId, cellId, status, state, telemetry } = snapshot;

  let stateLabel = 'Sin datos';
  if (state !== null) {
    const reason =
      state.waitingReason === null ? '' : ` · ${WAITING_REASON_LABELS[state.waitingReason]}`;
    stateLabel = `${STATE_LABELS[state.state]}${reason}`;
  }

  let palletLabel = 'Sin datos de producción';
  if (telemetry !== null) {
    const { currentLayer, layersPerPallet } = telemetry.pallet;
    const pallets = `${numberFormat.format(telemetry.palletsTotal)} ${telemetry.palletsTotal === 1 ? 'pallet' : 'pallets'}`;
    palletLabel = `${pallets} · capa ${String(currentLayer)} de ${String(layersPerPallet)}`;
  }

  return {
    id: `${siteId}/${cellId}`,
    siteId,
    cellId,
    online: status?.online ?? null,
    state: state?.state ?? null,
    stateLabel,
    boxesTotal: telemetry?.boxesTotal ?? null,
    boxesLabel: telemetry === null ? '—' : numberFormat.format(telemetry.boxesTotal),
    palletsTotal: telemetry?.palletsTotal ?? null,
    palletLabel,
  };
}
