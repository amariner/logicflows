import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { CellEvents, CellHistory } from './history.types';
import type { HistoryQuery } from './period';

/** Eventos que se muestran como mucho en el registro. */
export const EVENTS_LIMIT = 200;

/** Histórico e indicadores de planta de una célula (LF-80). */
@Injectable({ providedIn: 'root' })
export class HistoryApi {
  readonly #http = inject(HttpClient);
  readonly #config = inject(AppConfigService);

  load(siteId: string, cellId: string, query: HistoryQuery): Observable<CellHistory> {
    const path = `/api/v1/sites/${encodeURIComponent(siteId)}/cells/${encodeURIComponent(cellId)}/history`;
    return this.#http.get<CellHistory>(`${this.#config.config.apiUrl}${path}`, {
      params: { ...query },
    });
  }

  /** Registro de estados, alarmas y conexión del periodo (LF-84). */
  loadEvents(
    siteId: string,
    cellId: string,
    query: Pick<HistoryQuery, 'from' | 'to'>,
    limit = EVENTS_LIMIT,
  ): Observable<CellEvents> {
    const path = `/api/v1/sites/${encodeURIComponent(siteId)}/cells/${encodeURIComponent(cellId)}/events`;
    return this.#http.get<CellEvents>(`${this.#config.config.apiUrl}${path}`, {
      params: { from: query.from, to: query.to, limit },
    });
  }
}
