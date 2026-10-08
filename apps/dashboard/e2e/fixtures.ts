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
  {
    ...cell('cell-03', 'FAULT', {
      alarms: [
        alarm('ROB-001', 'HIGH', 'Colisión del robot detectada'),
        alarm('CONV-002', 'MEDIUM', 'Atasco en la cinta de entrada'),
      ],
    }),
    // Una alarma reconocida y otra sin reconocer (ADR-0022).
    acknowledgements: [
      {
        code: 'ROB-001',
        raisedAt: at,
        acknowledgedBy: 'operaria',
        acknowledgedAt: '2026-10-05T08:32:00.000Z',
      },
    ],
  },
  cell('cell-04', 'EMERGENCY_STOP', {
    alarms: [alarm('SAF-001', 'CRITICAL', 'Parada de emergencia activada')],
  }),
  cell('cell-05', 'STOPPED', { online: false, boxes: 980 }),
  cell('cell-06', 'PAUSED'),
  cell('cell-07', 'STARTING'),
];

const API = 'http://api.test';

const hourly = (hour: number, boxes: number) => ({
  from: `2026-10-05T${String(hour).padStart(2, '0')}:00:00.000Z`,
  to: `2026-10-05T${String(hour + 1).padStart(2, '0')}:00:00.000Z`,
  boxes,
  pallets: Math.floor(boxes / 40),
  seconds: {
    total: 3600,
    shift: 0,
    noData: 0,
    outOfProduction: 0,
    planned: 3600,
    running: 3300,
    stopped: 300,
  },
  availability: 3300 / 3600,
  performance: boxes / 825,
  stops: [
    { cause: 'FAULT', alarmCode: 'ROB-001', seconds: 240, count: 1 },
    { cause: 'STARVED', alarmCode: null, seconds: 60, count: 2 },
  ],
  alarms: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
});

/** Histórico de una célula (LF-80): ocho horas de un turno. */
export const HISTORY = {
  siteId: 'demo',
  cellId: 'cell-01',
  from: '2026-10-05T06:00:00.000Z',
  to: '2026-10-05T14:00:00.000Z',
  resolution: 'hour',
  timeZone: 'Europe/Madrid',
  nominalBoxesPerHour: 900,
  summary: {
    ...hourly(6, 6000),
    to: '2026-10-05T14:00:00.000Z',
    seconds: {
      total: 28_800,
      shift: 0,
      noData: 0,
      outOfProduction: 0,
      planned: 28_800,
      running: 26_400,
      stopped: 2400,
    },
    performance: 6000 / 6600,
    stops: [
      { cause: 'FAULT', alarmCode: 'ROB-001', seconds: 1920, count: 8 },
      { cause: 'STARVED', alarmCode: null, seconds: 480, count: 16 },
    ],
  },
  periods: [690, 750, 800, 420, 760, 810, 780, 990].map((boxes, index) => hourly(6 + index, boxes)),
};

/** Registro de la célula (LF-84): fallo con alarmas, espera, producción y desconexión. */
export const EVENTS = {
  from: HISTORY.from,
  to: HISTORY.to,
  truncated: true,
  events: [
    {
      kind: 'connection',
      at: '2026-10-05T13:40:00.000Z',
      state: null,
      previousState: null,
      event: null,
      waitingReason: null,
      alarms: [],
      online: false,
      durationSeconds: null,
    },
    {
      kind: 'state',
      at: '2026-10-05T13:10:00.000Z',
      state: 'RUNNING',
      previousState: 'FAULT',
      event: 'started',
      waitingReason: null,
      alarms: [],
      online: null,
      durationSeconds: null,
    },
    {
      kind: 'state',
      at: '2026-10-05T12:50:00.000Z',
      state: 'FAULT',
      previousState: 'RUNNING',
      event: 'fault',
      waitingReason: null,
      alarms: [
        alarm('ROB-001', 'HIGH', 'Colisión del robot detectada'),
        alarm('CONV-002', 'MEDIUM', 'Atasco en la cinta de entrada'),
      ],
      online: null,
      durationSeconds: 1200,
    },
    {
      kind: 'state',
      at: '2026-10-05T12:30:00.000Z',
      state: 'WAITING',
      previousState: 'RUNNING',
      event: 'starved',
      waitingReason: 'STARVED',
      alarms: [],
      online: null,
      durationSeconds: 1200,
    },
    {
      kind: 'state',
      at: '2026-10-05T12:00:00.000Z',
      state: 'PAUSED',
      previousState: 'RUNNING',
      event: 'pause',
      waitingReason: null,
      alarms: [],
      online: null,
      durationSeconds: 1800,
    },
  ],
};

/** Simula la API: configuración, estado por REST y canal de tiempo real. */
export async function mockApi(page: Page): Promise<void> {
  await page.route('**/config.json', (route) => route.fulfill({ json: { apiUrl: API } }));
  await page.route(`${API}/api/v1/cells`, (route) =>
    route.fulfill({ json: CELLS, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.route(/\/api\/v1\/sites\/[^/]+\/cells\/[^/]+\/history\?/, (route) =>
    route.fulfill({ json: HISTORY, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.route(/\/api\/v1\/sites\/[^/]+\/cells\/[^/]+\/events\?/, (route) =>
    route.fulfill({ json: EVENTS, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.routeWebSocket(`ws://api.test/realtime`, (socket) => {
    socket.send(JSON.stringify({ type: 'snapshot', cells: CELLS }));
  });
}
