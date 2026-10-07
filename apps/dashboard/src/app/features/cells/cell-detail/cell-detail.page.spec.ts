import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { buildStateMessage, buildTelemetryMessage } from '@logicflows/contract/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RealtimeService } from '../../../core/realtime/realtime.service';
import { FakeWebSocket } from '../../../../testing/fake-web-socket';
import { testProviders } from '../../../../testing/providers';
import { CellDetailPage } from './cell-detail.page';

const route = (cellId: string) => ({
  provide: ActivatedRoute,
  useValue: { snapshot: { paramMap: convertToParamMap({ siteId: 'demo', cellId }) } },
});

const render = async (cellId: string) => {
  TestBed.configureTestingModule({ providers: [...testProviders(), route(cellId)] });
  TestBed.inject(RealtimeService).start();
  const fixture = TestBed.createComponent(CellDetailPage);
  const socket = FakeWebSocket.latest();
  socket.open();
  socket.receive({
    type: 'snapshot',
    cells: [
      {
        siteId: 'demo',
        cellId: 'cell-01',
        status: null,
        state: buildStateMessage({
          state: 'FAULT',
          activeAlarms: [
            {
              code: 'ROB-001',
              severity: 'HIGH',
              message: 'Colisión del robot detectada',
              raisedAt: '2026-10-05T08:30:00.000Z',
            },
          ],
        }),
        telemetry: buildTelemetryMessage({
          boxesTotal: 42,
          pallet: { currentLayer: 2, layersPerPallet: 4, boxesInLayer: 2, boxesPerLayer: 8 },
          robot: { state: 'FAULT' },
        }),
      },
    ],
  });
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('detalle de una célula (LF-106)', () => {
  beforeEach(() => {
    FakeWebSocket.reset();
  });

  afterEach(() => {
    TestBed.inject(RealtimeService).stop();
  });

  it('muestra el estado, las alarmas, el esquema y la producción en tiempo real', async () => {
    const element = await render('cell-01');
    expect(element.querySelector('h1')?.textContent).toContain('cell-01');
    expect(element.querySelector('[data-testid="state"]')?.textContent.trim()).toBe('Fallo');
    expect(element.querySelector('[data-testid="alarm"]')?.textContent).toContain('ROB-001');
    expect(element.querySelector('app-cell-schematic')?.textContent).toContain('Robot averiado');
    expect(element.querySelector('[data-testid="boxes"]')?.textContent).toBe('42');
    // Pide lo que lleva hoy la célula a la API de histórico.
    TestBed.inject(HttpTestingController)
      .match((request) => request.url.includes('/cells/cell-01/history'))
      .forEach((request) => {
        request.flush(null);
      });
  });

  it('sin datos de la célula lo dice, y sigue enlazando con su histórico', async () => {
    const element = await render('cell-99');
    expect(element.textContent).toContain('Todavía no hay datos de esta célula.');
    const link = element.querySelector('ion-button[aria-label="Histórico de cell-99"]');
    expect(link?.getAttribute('href')).toBe('/cells/demo/cell-99/history');
  });
});
