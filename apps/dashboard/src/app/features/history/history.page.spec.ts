import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../../app.routes';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { FileExport } from './history-export';
import { HISTORY_REFRESH_MS } from './history.page';
import type { ConnectionState } from '../../core/realtime/realtime.service';
import { testProviders } from '../../../testing/providers';
import type { CellEvents, CellHistory, PeriodIndicators } from './history.types';

const URL = 'http://api.test/api/v1/sites/demo/cells/cell-01/history';
const EVENTS_URL = 'http://api.test/api/v1/sites/demo/cells/cell-01/events';

const EVENTS: CellEvents = {
  from: '2026-10-05T06:00:00.000Z',
  to: '2026-10-05T07:00:00.000Z',
  truncated: false,
  events: [
    {
      kind: 'state',
      at: '2026-10-05T06:20:00.000Z',
      state: 'FAULT',
      previousState: 'RUNNING',
      event: 'fault',
      waitingReason: null,
      alarms: [
        {
          code: 'ROB-001',
          severity: 'HIGH',
          message: 'Colisión del robot detectada',
          raisedAt: '2026-10-05T06:20:00.000Z',
        },
      ],
      online: null,
      durationSeconds: 360,
    },
  ],
};

const flushEvents = (http: HttpTestingController) => {
  http.expectOne((candidate) => candidate.url === EVENTS_URL).flush(EVENTS);
};

const indicators = (values: Partial<PeriodIndicators> = {}): PeriodIndicators => ({
  from: '2026-10-05T06:00:00.000Z',
  to: '2026-10-05T07:00:00.000Z',
  boxes: 810,
  pallets: 20,
  seconds: {
    total: 3600,
    noData: 0,
    outOfProduction: 0,
    planned: 3600,
    running: 3240,
    stopped: 360,
  },
  availability: 0.9,
  performance: 1,
  stops: [{ cause: 'FAULT', alarmCode: 'ROB-001', seconds: 360, count: 1 }],
  alarms: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
  ...values,
});

const HISTORY: CellHistory = {
  siteId: 'demo',
  cellId: 'cell-01',
  from: '2026-10-05T06:00:00.000Z',
  to: '2026-10-05T07:00:00.000Z',
  resolution: 'hour',
  timeZone: 'UTC',
  nominalBoxesPerHour: 900,
  summary: indicators(),
  periods: [indicators()],
};

const files = { save: vi.fn<FileExport['save']>().mockResolvedValue(undefined) };

async function open(connection = signal<ConnectionState>('closed'), refreshMs = 60_000) {
  files.save.mockClear();
  TestBed.configureTestingModule({
    providers: [
      { provide: FileExport, useValue: files },
      ...testProviders(),
      provideRouter(routes),
      { provide: RealtimeService, useValue: { connection } },
      { provide: HISTORY_REFRESH_MS, useValue: refreshMs },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/cells/demo/cell-01/history');
  return { harness, http: TestBed.inject(HttpTestingController) };
}

const text = (harness: RouterTestingHarness) => harness.routeNativeElement?.textContent ?? '';
const root = (harness: RouterTestingHarness): HTMLElement =>
  harness.routeNativeElement ?? document.createElement('div');

describe('página del histórico', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('pide el día en curso por horas y muestra los indicadores, el gráfico y las paradas', async () => {
    const { harness, http } = await open();
    expect(text(harness)).toContain('Cargando el histórico');
    const request = http.expectOne((candidate) => candidate.url === URL);
    expect(request.request.params.get('resolution')).toBe('hour');
    request.flush(HISTORY);
    flushEvents(http);
    await harness.fixture.whenStable();
    const page = root(harness);
    expect(page.querySelector('[data-testid="availability"]')?.textContent).toBe('90 %');
    expect(page.querySelector('[data-testid="performance"]')?.textContent).toBe('100 %');
    expect(page.querySelectorAll('rect')).toHaveLength(1);
    expect(page.querySelector('.plot')?.getAttribute('aria-label')).toContain('810 cajas en total');
    expect(page.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(page.querySelector('[data-testid="stop"]')?.textContent).toContain('Fallo ROB-001');
    const event = page.querySelector('[data-testid="event"]');
    expect(event?.textContent).toContain('Fallo');
    expect(event?.textContent).toContain('durante 6 min');
    expect(event?.textContent).toContain('Alta · ROB-001 · Colisión del robot detectada');
  });

  it('al elegir 7 días, pide el histórico por días', async () => {
    const { harness, http } = await open();
    http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
    flushEvents(http);
    await harness.fixture.whenStable();
    const week = [...root(harness).querySelectorAll('ion-button')].find(
      (button) => button.textContent.trim() === '7 días',
    );
    week?.click();
    await harness.fixture.whenStable();
    const request = http.expectOne((candidate) => candidate.url === URL);
    expect(request.request.params.get('resolution')).toBe('day');
    expect(week?.getAttribute('aria-pressed')).toBe('true');
    request.flush({ ...HISTORY, resolution: 'day' });
    flushEvents(http);
  });

  it('sin conexión, indica que no hay datos y permite reintentar', async () => {
    const { harness, http } = await open();
    http
      .expectOne((candidate) => candidate.url === URL)
      .error(new ProgressEvent('error'), { status: 0 });
    // forkJoin cancela la otra petición al fallar una.
    http.expectOne((candidate) => candidate.url === EVENTS_URL);
    await harness.fixture.whenStable();
    expect(text(harness)).toContain('Sin conexión con la API: no hay datos del histórico.');
    root(harness).querySelector<HTMLElement>('[role="alert"] ion-button')?.click();
    await harness.fixture.whenStable();
    http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
    flushEvents(http);
    await harness.fixture.whenStable();
    expect(text(harness)).toContain('Paradas por causa');
  });

  it('reintenta al recuperar la conexión, pero no en bucle si la API falla', async () => {
    const connection = signal<ConnectionState>('open');
    const { harness, http } = await open(connection);
    http
      .expectOne((candidate) => candidate.url === URL)
      .flush('error', { status: 500, statusText: 'Error' });
    http.expectOne((candidate) => candidate.url === EVENTS_URL);
    await harness.fixture.whenStable();
    expect(text(harness)).toContain('No se pudo cargar el histórico.');
    http.expectNone((candidate) => candidate.url === URL || candidate.url === EVENTS_URL);
    connection.set('closed');
    await harness.fixture.whenStable();
    connection.set('open');
    await harness.fixture.whenStable();
    http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
    flushEvents(http);
  });

  it('descarga el periodo en CSV (LF-88)', async () => {
    const { harness, http } = await open();
    http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
    flushEvents(http);
    await harness.fixture.whenStable();
    root(harness).querySelector<HTMLElement>('[data-testid="download"]')?.click();
    await harness.fixture.whenStable();
    expect(files.save).toHaveBeenCalledWith(
      'historico-demo-cell-01-2026-10-05-horas.csv',
      expect.stringContaining('Desde;Hasta;Cajas'),
      'text/csv;charset=utf-8',
    );
  });

  describe('actualización de «Hoy» (LF-87)', () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    it('con «Hoy», se vuelve a pedir sola sin mostrar «Cargando»', async () => {
      const { harness, http } = await open(signal<ConnectionState>('open'), 30);
      http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
      flushEvents(http);
      await harness.fixture.whenStable();
      await wait(80);
      const refresh = http
        .match((candidate) => candidate.url === URL)
        .filter((request) => !request.cancelled);
      expect(refresh).toHaveLength(1);
      expect(text(harness)).not.toContain('Cargando');
      expect(text(harness)).toContain('Paradas por causa');
      for (const request of refresh) {
        request.flush({ ...HISTORY, summary: indicators({ boxes: 900 }) });
      }
      for (const request of http.match((candidate) => candidate.url === EVENTS_URL)) {
        if (!request.cancelled) {
          request.flush(EVENTS);
        }
      }
      await harness.fixture.whenStable();
      expect(text(harness)).toContain('900');
      harness.fixture.destroy();
      http.match(() => true);
    });

    it('un fallo al actualizar no borra lo que se ve', async () => {
      const { harness, http } = await open(signal<ConnectionState>('open'), 30);
      http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
      flushEvents(http);
      await harness.fixture.whenStable();
      await wait(80);
      for (const request of http.match((candidate) => candidate.url === URL)) {
        if (!request.cancelled) {
          request.flush('error', { status: 500, statusText: 'Error' });
        }
      }
      http.match((candidate) => candidate.url === EVENTS_URL);
      await harness.fixture.whenStable();
      expect(text(harness)).toContain('Paradas por causa');
      expect(text(harness)).not.toContain('No se pudo cargar');
      harness.fixture.destroy();
      http.match(() => true);
    });

    it('sin conexión, o con 7 días, no se actualiza', async () => {
      const { harness, http } = await open(signal<ConnectionState>('closed'), 20);
      http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
      flushEvents(http);
      await harness.fixture.whenStable();
      await wait(80);
      http.expectNone((candidate) => candidate.url === URL);
    });
  });
});
