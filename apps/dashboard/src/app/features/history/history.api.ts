import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { CellHistory } from './history.types';
import type { HistoryQuery } from './period';

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
}
