import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';

import { HistoryApi } from '../history/history.api';
import { formatRatio } from '../history/history-view';
import { deviceTimeZone, periodQuery } from '../history/period';

const integer = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/** Lo que lleva hoy una célula, preparado para su tarjeta (LF-91). */
export interface TodaySummary {
  readonly boxes: string;
  readonly availability: string;
}

export const NO_SUMMARY: TodaySummary = { boxes: '—', availability: '—' };

interface Cell {
  readonly id: string;
  readonly siteId: string;
  readonly cellId: string;
}

/**
 * Resumen de hoy de cada célula: cajas y disponibilidad desde la medianoche
 * local, de la API de histórico (LF-80). Un fallo no borra el último resumen
 * conocido de la célula.
 */
@Injectable({ providedIn: 'root' })
export class TodaySummaries {
  readonly #api = inject(HistoryApi);
  readonly #summaries = signal<ReadonlyMap<string, TodaySummary>>(new Map());

  readonly summaries = computed(() => this.#summaries());

  refresh(cells: readonly Cell[], now: Date = new Date()): void {
    if (cells.length === 0) {
      return;
    }
    const query = periodQuery('today', now, deviceTimeZone());
    forkJoin(
      cells.map((cell) =>
        this.#api.load(cell.siteId, cell.cellId, query).pipe(
          map((history) => ({
            id: cell.id,
            summary: {
              boxes: integer.format(history.summary.boxes),
              availability: formatRatio(history.summary.availability),
            } satisfies TodaySummary,
          })),
          catchError(() => of({ id: cell.id, summary: null })),
        ),
      ),
    ).subscribe((results) => {
      const next = new Map(this.#summaries());
      for (const { id, summary } of results) {
        if (summary !== null) {
          next.set(id, summary);
        }
      }
      this.#summaries.set(next);
    });
  }
}
