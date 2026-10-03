import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { testProviders } from '../../../testing/providers';
import type { CellHistory } from '../history/history.types';
import { TodaySummaries } from './today-summary';

const URL = (cellId: string) => `http://api.test/api/v1/sites/demo/cells/${cellId}/history`;

const history = (boxes: number, availability: number | null) =>
  ({ summary: { boxes, availability } }) as unknown as CellHistory;

const cell = (cellId: string) => ({ id: `demo/${cellId}`, siteId: 'demo', cellId });

describe('resumen de hoy de las células (LF-91)', () => {
  it('pide el día en curso por horas de cada célula y formatea cajas y disponibilidad', () => {
    TestBed.configureTestingModule({ providers: testProviders() });
    const summaries = TestBed.inject(TodaySummaries);
    const http = TestBed.inject(HttpTestingController);
    summaries.refresh([cell('cell-01'), cell('cell-02')]);
    const first = http.expectOne((request) => request.url === URL('cell-01'));
    expect(first.request.params.get('resolution')).toBe('hour');
    first.flush(history(15_234, 0.905));
    http.expectOne((request) => request.url === URL('cell-02')).flush(history(0, null));
    expect(summaries.summaries().get('demo/cell-01')).toEqual({
      boxes: '15.234',
      availability: '90,5 %',
    });
    expect(summaries.summaries().get('demo/cell-02')).toEqual({ boxes: '0', availability: '—' });
  });

  it('si falla una célula, conserva su último resumen y actualiza las demás', () => {
    TestBed.configureTestingModule({ providers: testProviders() });
    const summaries = TestBed.inject(TodaySummaries);
    const http = TestBed.inject(HttpTestingController);
    summaries.refresh([cell('cell-01')]);
    http.expectOne((request) => request.url === URL('cell-01')).flush(history(100, 1));
    summaries.refresh([cell('cell-01'), cell('cell-02')]);
    http
      .expectOne((request) => request.url === URL('cell-01'))
      .flush('error', { status: 500, statusText: 'Error' });
    http.expectOne((request) => request.url === URL('cell-02')).flush(history(5, 0.5));
    expect(summaries.summaries().get('demo/cell-01')?.boxes).toBe('100');
    expect(summaries.summaries().get('demo/cell-02')?.boxes).toBe('5');
  });
});
