import { HttpTestingController } from '@angular/common/http/testing';
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

  const restRequest = () =>
    TestBed.inject(HttpTestingController).expectOne('http://api.test/api/v1/cells');

  it('al arrancar carga el estado por REST sin esperar al tiempo real', () => {
    service.start();
    restRequest().flush([cell('cell-01', { state: buildStateMessage({ state: 'FAULT' }) })]);
    expect(service.cells().map((c) => c.state?.state)).toEqual(['FAULT']);
    expect(service.connection()).toBe('connecting');
  });

  it('una respuesta REST que llega tarde no sustituye datos más recientes', () => {
    service.start();
    FakeWebSocket.latest().receive({
      type: 'snapshot',
      cells: [cell('cell-01', { state: buildStateMessage({ seq: 8, state: 'RUNNING' }) })],
    });
    restRequest().flush([
      cell('cell-01', { state: buildStateMessage({ seq: 7, state: 'STOPPED' }) }),
    ]);
    expect(service.cells()[0]?.state?.state).toBe('RUNNING');
  });

  it('si la carga por REST falla, sigue con el tiempo real', () => {
    service.start();
    restRequest().flush('Error', { status: 503, statusText: 'Service Unavailable' });
    FakeWebSocket.latest().receive({ type: 'snapshot', cells: [cell('cell-01')] });
    expect(service.cells()).toHaveLength(1);
  });

  it('tras reconectar, la nueva instantánea no deja datos incoherentes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    service.start();
    const first = FakeWebSocket.latest();
    first.open();
    first.receive({
      type: 'snapshot',
      cells: [cell('cell-01', { telemetry: buildTelemetryMessage({ seq: 3, boxesTotal: 30 }) })],
    });
    first.drop();
    vi.advanceTimersByTime(1_000);
    // Durante el corte la célula siguió produciendo: la instantánea trae lo último.
    FakeWebSocket.latest().receive({
      type: 'snapshot',
      cells: [cell('cell-01', { telemetry: buildTelemetryMessage({ seq: 9, boxesTotal: 36 }) })],
    });
    // Un mensaje retrasado del primer canal no puede hacer retroceder el contador.
    first.receive({
      type: 'cell',
      cell: cell('cell-01', { telemetry: buildTelemetryMessage({ seq: 4, boxesTotal: 31 }) }),
    });
    expect(service.cells()[0]?.telemetry?.boxesTotal).toBe(36);
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
