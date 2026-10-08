/** Un turno semanal (ADR-0021): día ISO (1 lunes … 7 domingo) y horas en punto. */
export interface Shift {
  readonly weekday: number;
  readonly start: number;
  readonly end: number;
  readonly name: string;
}

export interface CalendarVersion {
  readonly effectiveFrom: string;
  readonly timeZone: string;
  readonly shifts: readonly Shift[];
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CalendarException {
  readonly date: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

/** Respuesta de `GET /api/v1/sites/{siteId}/calendar` (LF-124). */
export interface SiteCalendar {
  readonly siteId: string;
  readonly today: string;
  readonly current: string | null;
  readonly versions: readonly CalendarVersion[];
  readonly exceptions: readonly CalendarException[];
}
