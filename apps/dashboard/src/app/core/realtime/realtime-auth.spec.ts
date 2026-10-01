import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { REALTIME_UNAUTHORIZED_CLOSE_CODE } from '@logicflows/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeWebSocket } from '../../../testing/fake-web-socket';
import { testProviders } from '../../../testing/providers';
import { RealtimeService } from './realtime.service';

describe('canal de tiempo real con inicio de sesión', () => {
  let service: RealtimeService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.reset();
    TestBed.configureTestingModule({ providers: testProviders({ auth: true }) });
    service = TestBed.inject(RealtimeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  const grantTicket = async (ticket: string) => {
    const request = http.expectOne('http://api.test/api/v1/realtime/tickets');
    expect(request.request.method).toBe('POST');
    request.flush({ ticket, expiresAt: '2026-10-05T08:00:30.000Z' });
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.at(-1)?.url).toContain(ticket);
    });
  };

  it('pide un tique y lo usa para conectar', async () => {
    service.start();
    http.expectOne('http://api.test/api/v1/cells').flush([]);
    expect(FakeWebSocket.instances).toHaveLength(0);
    await grantTicket('tique-1');
    expect(FakeWebSocket.latest().url).toBe('ws://api.test/realtime?ticket=tique-1');
  });

  it('si la API cierra por sesión caducada, pide otro tique y reconecta', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    service.start();
    http.expectOne('http://api.test/api/v1/cells').flush([]);
    await grantTicket('tique-1');
    FakeWebSocket.latest().open();

    FakeWebSocket.latest().drop(REALTIME_UNAUTHORIZED_CLOSE_CODE);
    expect(service.connection()).toBe('closed');
    vi.advanceTimersByTime(1_000);
    await grantTicket('tique-2');
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('si no consigue el tique, lo reintenta con espera creciente', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    service.start();
    http.expectOne('http://api.test/api/v1/cells').flush([]);
    http
      .expectOne('http://api.test/api/v1/realtime/tickets')
      .flush('No disponible', { status: 503, statusText: 'Service Unavailable' });
    await vi.waitFor(() => {
      expect(service.connection()).toBe('closed');
    });
    vi.advanceTimersByTime(1_000);
    await grantTicket('tique-2');
  });
});
