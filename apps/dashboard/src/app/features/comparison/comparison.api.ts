import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { HistoryQuery } from '../history/period';
import type { SiteComparison } from './comparison.types';

/** Indicadores de todas las células de una planta en un periodo (LF-129). */
@Injectable({ providedIn: 'root' })
export class ComparisonApi {
  readonly #http = inject(HttpClient);
  readonly #config = inject(AppConfigService);

  load(siteId: string, query: HistoryQuery): Observable<SiteComparison> {
    const path = `/api/v1/sites/${encodeURIComponent(siteId)}/comparison`;
    return this.#http.get<SiteComparison>(`${this.#config.config.apiUrl}${path}`, {
      params: { ...query },
    });
  }
}
