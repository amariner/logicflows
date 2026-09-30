import { TestBed } from '@angular/core/testing';
import { buildTelemetryMessage } from '@logicflows/contract/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RealtimeService } from '../../core/realtime/realtime.service';
import { FakeWebSocket } from '../../../testing/fake-web-socket';
import { testProviders } from '../../../testing/providers';
import { CellsPage } from './cells.page';

describe('página de células en tiempo real', () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    TestBed.configureTestingModule({ providers: testProviders() });
    TestBed.inject(RealtimeService).start();
  });

  afterEach(() => {
    TestBed.inject(RealtimeService).stop();
  });

  it('actualiza el contador en cuanto llega una caja y muestra la conexión', async () => {
    const fixture = TestBed.createComponent(CellsPage);
    const element = fixture.nativeElement as HTMLElement;
    const socket = FakeWebSocket.latest();
    socket.open();
    const telemetry = (boxesTotal: number) => ({
      siteId: 'demo',
      cellId: 'cell-01',
      status: null,
      state: null,
      telemetry: buildTelemetryMessage({ boxesTotal }),
    });

    socket.receive({ type: 'snapshot', cells: [telemetry(41)] });
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="boxes"]')?.textContent).toBe('41');
    expect(element.textContent).toContain('En directo');

    socket.receive({ type: 'cell', cell: telemetry(42) });
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="boxes"]')?.textContent).toBe('42');
  });
});
