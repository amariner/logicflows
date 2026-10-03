import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type { ConnectionState } from '../../core/realtime/realtime.service';
import { testProviders } from '../../../testing/providers';
import type { CellHistory, PeriodIndicators } from './history.types';

const URL = 'http://api.test/api/v1/sites/demo/cells/cell-01/history';

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

async function open(connection = signal<ConnectionState>('closed')) {
  TestBed.configureTestingModule({
    providers: [
      ...testProviders(),
      provideRouter(routes),
      { provide: RealtimeService, useValue: { connection } },
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
    await harness.fixture.whenStable();
    const page = root(harness);
    expect(page.querySelector('[data-testid="availability"]')?.textContent).toBe('90 %');
    expect(page.querySelector('[data-testid="performance"]')?.textContent).toBe('100 %');
    expect(page.querySelectorAll('rect')).toHaveLength(1);
    expect(page.querySelector('.plot')?.getAttribute('aria-label')).toContain('810 cajas en total');
    expect(page.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(page.querySelector('[data-testid="stop"]')?.textContent).toContain('Fallo ROB-001');
  });

  it('al elegir 7 días, pide el histórico por días', async () => {
    const { harness, http } = await open();
    http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
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
  });

  it('sin conexión, indica que no hay datos y permite reintentar', async () => {
    const { harness, http } = await open();
    http
      .expectOne((candidate) => candidate.url === URL)
      .error(new ProgressEvent('error'), { status: 0 });
    await harness.fixture.whenStable();
    expect(text(harness)).toContain('Sin conexión con la API: no hay datos del histórico.');
    root(harness).querySelector<HTMLElement>('[role="alert"] ion-button')?.click();
    await harness.fixture.whenStable();
    http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
    await harness.fixture.whenStable();
    expect(text(harness)).toContain('Paradas por causa');
  });

  it('reintenta al recuperar la conexión, pero no en bucle si la API falla', async () => {
    const connection = signal<ConnectionState>('open');
    const { harness, http } = await open(connection);
    http
      .expectOne((candidate) => candidate.url === URL)
      .flush('error', { status: 500, statusText: 'Error' });
    await harness.fixture.whenStable();
    expect(text(harness)).toContain('No se pudo cargar el histórico.');
    http.expectNone((candidate) => candidate.url === URL);
    connection.set('closed');
    await harness.fixture.whenStable();
    connection.set('open');
    await harness.fixture.whenStable();
    http.expectOne((candidate) => candidate.url === URL).flush(HISTORY);
  });
});
