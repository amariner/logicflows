import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AlarmAcknowledgement } from '@logicflows/contract';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';

/** Reconocimiento de alarmas (ADR-0022). */
@Injectable({ providedIn: 'root' })
export class AlarmsApi {
  readonly #http = inject(HttpClient);
  readonly #config = inject(AppConfigService);

  /**
   * Reconoce una activación. La célula actualizada llega también por el canal
   * en tiempo real, a este visor y a los demás.
   */
  acknowledge(
    siteId: string,
    cellId: string,
    code: string,
    raisedAt: string,
  ): Promise<AlarmAcknowledgement> {
    const path = `/api/v1/sites/${encodeURIComponent(siteId)}/cells/${encodeURIComponent(cellId)}/alarms/${encodeURIComponent(code)}/acknowledgements`;
    return firstValueFrom(
      this.#http.post<AlarmAcknowledgement>(`${this.#config.config.apiUrl}${path}`, { raisedAt }),
    );
  }
}
