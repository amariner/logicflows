import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Observable } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { Shift, SiteCalendar } from './calendar.types';

/** Calendario de turnos de una planta (ADR-0021, LF-124). */
@Injectable({ providedIn: 'root' })
export class CalendarApi {
  readonly #http = inject(HttpClient);
  readonly #config = inject(AppConfigService);

  load(siteId: string): Observable<SiteCalendar> {
    return this.#http.get<SiteCalendar>(this.#url(siteId));
  }

  saveVersion(
    siteId: string,
    effectiveFrom: string,
    timeZone: string,
    shifts: readonly Shift[],
  ): Promise<unknown> {
    return firstValueFrom(
      this.#http.put(`${this.#url(siteId)}/versions/${effectiveFrom}`, { timeZone, shifts }),
    );
  }

  deleteVersion(siteId: string, effectiveFrom: string): Promise<unknown> {
    return firstValueFrom(this.#http.delete(`${this.#url(siteId)}/versions/${effectiveFrom}`));
  }

  saveException(siteId: string, date: string, name: string): Promise<unknown> {
    return firstValueFrom(this.#http.put(`${this.#url(siteId)}/exceptions/${date}`, { name }));
  }

  deleteException(siteId: string, date: string): Promise<unknown> {
    return firstValueFrom(this.#http.delete(`${this.#url(siteId)}/exceptions/${date}`));
  }

  #url(siteId: string): string {
    return `${this.#config.config.apiUrl}/api/v1/sites/${encodeURIComponent(siteId)}/calendar`;
  }
}
