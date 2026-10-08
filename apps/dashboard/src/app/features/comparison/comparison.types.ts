import type { PeriodIndicators } from '../history/history.types';

/** Respuesta de `GET /api/v1/sites/{siteId}/comparison` (LF-129). */
export interface SiteComparison {
  readonly siteId: string;
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly cells: readonly {
    readonly cellId: string;
    readonly nominalBoxesPerHour: number;
    readonly summary: PeriodIndicators;
  }[];
}
