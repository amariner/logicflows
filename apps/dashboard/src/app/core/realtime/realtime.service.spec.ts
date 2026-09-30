import { TestBed } from '@angular/core/testing';
import { buildStateMessage, buildTelemetryMessage } from '@logicflows/contract/testing';
import type { CellSnapshot } from '@logicflows/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeWebSocket } from '../../../testing/fake-web-socket';
import { testProviders } from '../../../testing/providers';
import { RealtimeService } from './realtime.service';

const cell = (cellId: string, overrides: Partial<CellSnapshot> = {}): CellSnapshot => ({
  siteId: 'demo',
  cellId,
  status: null,
  state: null,
  telemetry: null,
  ...overrides,
});

describe('canal de tiempo real del visor', () => {
  let service: RealtimeService;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.reset();
    TestBed.configureTestingModule({ providers: testProviders() });
    service = TestBed.inject(RealtimeService);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('se conecta a la URL de tiempo real derivada de la configuración', () => {
    service.start();
    service.start();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.latest().url).toBe('ws://api.test/realtime');
    expect(service.connection()).toBe('connecting');
    FakeWebSocket.latest().open();
    expect(service.connection()).toBe('open');
  });

  it('muestra las células de la instantánea ordenadas', () => {
    service.start();
    FakeWebSocket.latest().receive({ type: 'snapshot', cells: [cell('cell-02'), cell('cell-01')] });
    expect(service.cells().map((c) => c.cellId)).toEqual(['cell-01', 'cell-02']);
  });

  it('actualiza solo la célula que cambia', () => {
    service.start();
    const socket = FakeWebSocket.latest();
    socket.receive({ type: 'snapshot', cells: [cell('cell-01'), cell('cell-02')] });
    socket.receive({
      type: 'cell',
      cell: cell('cell-02', { telemetry: buildTelemetryMessage({ boxesTotal: 9 }) }),
    });
    expect(service.cells().map((c) => c.telemetry?.boxesTotal ?? null)).toEqual([null, 9]);
  });

  it('añade una célula nueva que llega en un cambio', () => {
    service.start();
    FakeWebSocket.latest().receive({ type: 'snapshot', cells: [] });
    FakeWebSocket.latest().receive({
      type: 'cell',
      cell: cell('cell-03', { state: buildStateMessage() }),
    });
    expect(service.cells()).toHaveLength(1);
  });

  it('reconecta con espera creciente y recupera el estado con la nueva instantánea', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    service.start();
    FakeWebSocket.latest().open();
    FakeWebSocket.latest().drop();
    expect(service.connection()).toBe('closed');

    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    FakeWebSocket.latest().drop();
    vi.advanceTimersByTime(1_999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    FakeWebSocket.latest().open();
    FakeWebSocket.latest().receive({ type: 'snapshot', cells: [cell('cell-01')] });
    expect(service.connection()).toBe('open');
    expect(service.cells()).toHaveLength(1);
  });

  it('no reconecta tras detenerse', () => {
    service.start();
    const socket = FakeWebSocket.latest();
    service.stop();
    socket.drop();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.closed).toBe(true);
  });
});
