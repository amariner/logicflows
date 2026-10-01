import type { Page } from '@playwright/test';
import type { Alarm, CellSnapshot, CellState, WaitingReason } from '@logicflows/contract';

const SESSION = '0199a1b2-7c00-7000-8000-000000000001';
const at = '2026-10-05T08:30:00.000Z';
let id = 0;
const messageId = () => `0199a1b2-7c00-7000-8000-${(++id).toString(16).padStart(12, '0')}`;

const envelope = (cellId: string) => ({
  schemaVersion: 1,
  messageId: messageId(),
  siteId: 'demo',
  cellId,
  sessionId: SESSION,
  timestamp: at,
});

function cell(
  cellId: string,
  state: CellState,
  options: { reason?: WaitingReason; alarms?: Alarm[]; online?: boolean; boxes?: number } = {},
): CellSnapshot {
  const running = state === 'RUNNING';
  return {
    siteId: 'demo',
    cellId,
    status: { ...envelope(cellId), online: options.online ?? true },
    state: {
      ...envelope(cellId),
      seq: 1,
      state,
      previousState: 'RUNNING',
      event: null,
      waitingReason: options.reason ?? null,
      since: at,
      activeAlarms: options.alarms ?? [],
    },
    telemetry: {
      ...envelope(cellId),
      seq: 1,
      boxesTotal: options.boxes ?? 15234,
      palletsTotal: 312,
      pallet: { currentLayer: 3, layersPerPallet: 5, boxesInLayer: 4, boxesPerLayer: 8 },
      cycleTimeMs: running ? 4200 : null,
      throughputBoxesPerHour: running ? 820 : 0,
      robot: { state: state === 'FAULT' ? 'FAULT' : running ? 'MOVING' : 'IDLE' },
      conveyor: { state: running ? 'RUNNING' : 'STOPPED' },
    },
  };
}

const alarm = (code: string, severity: Alarm['severity'], message: string): Alarm => ({
  code,
  severity,
  message,
  raisedAt: at,
});

/** Una célula por cada tono del diseño, más una desconectada. */
export const CELLS: CellSnapshot[] = [
  cell('cell-01', 'RUNNING'),
  cell('cell-02', 'WAITING', {
    reason: 'STARVED',
    alarms: [alarm('CONV-001', 'LOW', 'Sin cajas en la entrada')],
  }),
  cell('cell-03', 'FAULT', {
    alarms: [
      alarm('ROB-001', 'HIGH', 'Colisión del robot detectada'),
      alarm('CONV-002', 'MEDIUM', 'Atasco en la cinta de entrada'),
    ],
  }),
  cell('cell-04', 'EMERGENCY_STOP', {
    alarms: [alarm('SAF-001', 'CRITICAL', 'Parada de emergencia activada')],
  }),
  cell('cell-05', 'STOPPED', { online: false, boxes: 980 }),
  cell('cell-06', 'PAUSED'),
  cell('cell-07', 'STARTING'),
];

const API = 'http://api.test';

/** Simula la API: configuración, estado por REST y canal de tiempo real. */
export async function mockApi(page: Page): Promise<void> {
  await page.route('**/config.json', (route) => route.fulfill({ json: { apiUrl: API } }));
  await page.route(`${API}/api/v1/cells`, (route) =>
    route.fulfill({ json: CELLS, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.routeWebSocket(`ws://api.test/realtime`, (socket) => {
    socket.send(JSON.stringify({ type: 'snapshot', cells: CELLS }));
  });
}
