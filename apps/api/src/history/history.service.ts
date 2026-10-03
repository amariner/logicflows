import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/config.ts';
import { HistoryRepository } from './history.repository.ts';
import { HOUR_MS } from './hour-summary.ts';
import { computeIndicators } from './indicators.ts';
import type { HourRow, Indicators } from './indicators.ts';
import type { ProductionTotals } from './production.query.ts';
import { localDay } from './time-zone.ts';

export interface HistoryPeriod {
  readonly from: Date;
  readonly to: Date;
  readonly resolution: 'hour' | 'day';
  readonly timeZone: string;
}

export interface CellHistory {
  readonly nominalBoxesPerHour: number;
  /** Indicadores de todo el periodo. */
  readonly summary: Indicators;
  /** Indicadores de cada hora o de cada día del periodo, en orden. */
  readonly periods: readonly Indicators[];
}

const floorHour = (date: Date) => Math.floor(date.getTime() / HOUR_MS) * HOUR_MS;
const ceilHour = (date: Date) => Math.ceil(date.getTime() / HOUR_MS) * HOUR_MS;

/** Consultas por periodo sobre los agregados por hora (ADR-0016). */
@Injectable()
export class HistoryService {
  constructor(
    private readonly repository: HistoryRepository,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Ritmo nominal de una célula, en cajas por hora. */
  nominalBoxesPerHour(siteId: string, cellId: string): number {
    return (
      this.config.get('NOMINAL_BOXES_PER_HOUR_BY_CELL', { infer: true })[`${siteId}/${cellId}`] ??
      this.config.get('NOMINAL_BOXES_PER_HOUR', { infer: true })
    );
  }

  /**
   * Cajas y pallets producidos en [from, to), con el mismo resultado que el
   * dato en bruto (LF-33). Las horas completas salen de los agregados; los
   * extremos y las horas pendientes de recalcular, del dato en bruto.
   */
  async production(
    siteId: string,
    cellId: string,
    from: Date,
    to: Date,
  ): Promise<ProductionTotals> {
    const firstHour = ceilHour(from);
    const lastHour = floorHour(to);
    if (firstHour >= lastHour) {
      return this.repository.rawProduction(siteId, cellId, from, to);
    }
    const ranges: [Date, Date][] = [];
    if (from.getTime() < firstHour) {
      ranges.push([from, new Date(firstHour)]);
    }
    if (lastHour < to.getTime()) {
      ranges.push([new Date(lastHour), to]);
    }
    for (const hour of await this.repository.pendingHours(
      siteId,
      cellId,
      new Date(firstHour),
      new Date(lastHour),
    )) {
      ranges.push([hour, new Date(hour.getTime() + HOUR_MS)]);
    }
    const parts = await Promise.all([
      this.repository.aggregatedProduction(siteId, cellId, new Date(firstHour), new Date(lastHour)),
      ...ranges.map(([start, end]) => this.repository.rawProduction(siteId, cellId, start, end)),
    ]);
    return parts.reduce(
      (total, part) => ({ boxes: total.boxes + part.boxes, pallets: total.pallets + part.pallets }),
      { boxes: 0, pallets: 0 },
    );
  }

  /** Histórico de una célula con sus indicadores, por horas o por días. */
  async history(
    siteId: string,
    cellId: string,
    { from, to, resolution, timeZone }: HistoryPeriod,
    now: Date = new Date(),
  ): Promise<CellHistory> {
    const nominal = this.nominalBoxesPerHour(siteId, cellId);
    const rows = await this.repository.hours(siteId, cellId, from, to);
    const bounds: number[] = [];
    let previousDay: string | undefined;
    for (let hour = from.getTime(); hour < to.getTime(); hour += HOUR_MS) {
      const day = resolution === 'day' ? localDay(new Date(hour), timeZone) : undefined;
      if (resolution === 'hour' || day !== previousDay) {
        bounds.push(hour);
      }
      previousDay = day;
    }
    bounds.push(to.getTime());
    let next = 0;
    const periods = bounds.slice(0, -1).map((start, index) => {
      const end = bounds[index + 1] ?? to.getTime();
      const inPeriod: HourRow[] = [];
      for (
        let row = rows[next];
        row !== undefined && row.hour.getTime() < end;
        row = rows[++next]
      ) {
        inPeriod.push(row);
      }
      return computeIndicators(inPeriod, new Date(start), new Date(end), now, nominal);
    });
    return {
      nominalBoxesPerHour: nominal,
      summary: computeIndicators(rows, from, to, now, nominal),
      periods,
    };
  }
}
