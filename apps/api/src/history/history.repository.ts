import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { DATABASE } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import {
  cellHourly,
  cellHourlyPending,
  cellStateChanges,
  cellStatusEvents,
  telemetrySamples,
} from '../database/schema.ts';
import { HOUR_MS } from './hour-summary.ts';
import type { HourInput, HourSummary } from './hour-summary.ts';

/** Una hora de una célula. */
export interface CellHour {
  readonly siteId: string;
  readonly cellId: string;
  readonly hour: Date;
}

export interface PendingHour extends CellHour {
  readonly markedAt: Date;
}

/** Clave del bloqueo consultivo que reparte la agregación entre réplicas. */
const AGGREGATION_LOCK = 1_607_916;

export const hourOf = (timestamp: Date): Date =>
  new Date(Math.floor(timestamp.getTime() / HOUR_MS) * HOUR_MS);

/** Acceso a los agregados por hora y a las horas pendientes (ADR-0016). */
@Injectable()
export class HistoryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Marca horas como pendientes de recalcular. Repetirlo no cambia nada. La
   * marca usa el reloj de PostgreSQL, el mismo que `clock()`: con varias
   * réplicas, sus relojes pueden no coincidir.
   */
  async markPending(hours: readonly CellHour[]): Promise<void> {
    if (hours.length === 0) {
      return;
    }
    await this.db
      .insert(cellHourlyPending)
      .values(hours.map((hour) => ({ ...hour, markedAt: sql`clock_timestamp()` })))
      .onConflictDoUpdate({
        target: [cellHourlyPending.siteId, cellHourlyPending.cellId, cellHourlyPending.hour],
        set: { markedAt: sql`clock_timestamp()` },
      });
  }

  /** La hora de PostgreSQL, la de las marcas de horas pendientes. */
  async clock(): Promise<Date> {
    const result = await this.db.execute<{ now: string }>(sql`select clock_timestamp() as now`);
    return new Date(result.rows[0]?.now ?? Date.now());
  }

  async pendingCount(): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(cellHourlyPending);
    return row?.value ?? 0;
  }

  /**
   * Ejecuta `work` solo si ninguna otra réplica está agregando. El bloqueo es
   * de transacción: se libera solo al terminar, aunque la réplica caiga.
   */
  async exclusively(work: (repository: HistoryRepository) => Promise<void>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const result = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(${AGGREGATION_LOCK}) as locked`,
      );
      if (result.rows[0]?.locked !== true) {
        return false;
      }
      await work(new HistoryRepository(tx));
      return true;
    });
  }

  async oldestPending(limit: number): Promise<PendingHour[]> {
    return this.db
      .select()
      .from(cellHourlyPending)
      .orderBy(asc(cellHourlyPending.hour))
      .limit(limit);
  }

  /** Lo que hace falta para resumir una hora, salvo la producción. */
  async hourTimeline({
    siteId,
    cellId,
    hour,
  }: CellHour): Promise<Omit<HourInput, 'boxes' | 'pallets'>> {
    const end = new Date(hour.getTime() + HOUR_MS);
    const cell = (table: typeof cellStateChanges | typeof cellStatusEvents) =>
      and(eq(table.siteId, siteId), eq(table.cellId, cellId));

    const stateColumns = {
      at: cellStateChanges.sourceTimestamp,
      state: cellStateChanges.state,
      waitingReason: cellStateChanges.waitingReason,
      activeAlarms: cellStateChanges.activeAlarms,
    };
    const [stateBefore, statesInHour, statusBefore, statusesInHour] = await Promise.all([
      this.db
        .select(stateColumns)
        .from(cellStateChanges)
        .where(and(cell(cellStateChanges), lt(cellStateChanges.sourceTimestamp, hour)))
        .orderBy(desc(cellStateChanges.sourceTimestamp), desc(cellStateChanges.seq))
        .limit(1),
      this.db
        .select(stateColumns)
        .from(cellStateChanges)
        .where(
          and(
            cell(cellStateChanges),
            gte(cellStateChanges.sourceTimestamp, hour),
            lt(cellStateChanges.sourceTimestamp, end),
          ),
        )
        .orderBy(asc(cellStateChanges.sourceTimestamp), asc(cellStateChanges.seq)),
      this.db
        .select({ at: cellStatusEvents.sourceTimestamp, online: cellStatusEvents.online })
        .from(cellStatusEvents)
        .where(and(cell(cellStatusEvents), lt(cellStatusEvents.sourceTimestamp, hour)))
        .orderBy(desc(cellStatusEvents.sourceTimestamp))
        .limit(1),
      this.db
        .select({ at: cellStatusEvents.sourceTimestamp, online: cellStatusEvents.online })
        .from(cellStatusEvents)
        .where(
          and(
            cell(cellStatusEvents),
            gte(cellStatusEvents.sourceTimestamp, hour),
            lt(cellStatusEvents.sourceTimestamp, end),
          ),
        )
        .orderBy(asc(cellStatusEvents.sourceTimestamp)),
    ]);
    return {
      hourStart: hour.getTime(),
      states: [...stateBefore, ...statesInHour].map((row) => ({
        ...row,
        at: row.at.getTime(),
      })),
      statuses: [...statusBefore, ...statusesInHour].map((row) => ({
        ...row,
        at: row.at.getTime(),
      })),
    };
  }

  /**
   * Cajas y pallets producidos en una hora. Como la consulta en bruto, suma
   * las diferencias entre muestras consecutivas de cada sesión (ADR-0004),
   * pero solo lee la hora y la última muestra anterior de cada sesión.
   */
  async hourProduction({
    siteId,
    cellId,
    hour,
  }: CellHour): Promise<{ boxes: number; pallets: number }> {
    const end = new Date(hour.getTime() + HOUR_MS);
    const result = await this.db.execute<{ boxes: string | null; pallets: string | null }>(sql`
      with in_hour as (
        select session_id, seq, source_timestamp, boxes_total, pallets_total
        from ${telemetrySamples}
        where site_id = ${siteId} and cell_id = ${cellId}
          and source_timestamp >= ${hour} and source_timestamp < ${end}
      ),
      previous as (
        select before.session_id, before.seq, before.source_timestamp,
               before.boxes_total, before.pallets_total
        from (select distinct session_id from in_hour) as sessions
        cross join lateral (
          select session_id, seq, source_timestamp, boxes_total, pallets_total
          from ${telemetrySamples}
          where site_id = ${siteId} and cell_id = ${cellId}
            and session_id = sessions.session_id and source_timestamp < ${hour}
          order by seq desc
          limit 1
        ) as before
      ),
      samples as (
        select source_timestamp, boxes_total, pallets_total,
               lag(boxes_total) over w as previous_boxes,
               lag(pallets_total) over w as previous_pallets
        from (select * from previous union all select * from in_hour) as all_samples
        window w as (partition by session_id order by seq)
      )
      select
        sum(case when previous_boxes is null or boxes_total < previous_boxes
                 then boxes_total else boxes_total - previous_boxes end) as boxes,
        sum(case when previous_pallets is null or pallets_total < previous_pallets
                 then pallets_total else pallets_total - previous_pallets end) as pallets
      from samples
      where source_timestamp >= ${hour}
    `);
    const row = result.rows[0];
    return { boxes: Number(row?.boxes ?? 0), pallets: Number(row?.pallets ?? 0) };
  }

  async saveHour(hour: CellHour, summary: HourSummary, now: Date): Promise<void> {
    const values = {
      ...hour,
      boxes: summary.boxes,
      pallets: summary.pallets,
      seconds: { ...summary.seconds },
      stops: { ...summary.stops },
      alarms: { ...summary.alarms },
      computedAt: now,
    };
    await this.db
      .insert(cellHourly)
      .values(values)
      .onConflictDoUpdate({
        target: [cellHourly.siteId, cellHourly.cellId, cellHourly.hour],
        set: values,
      });
  }

  /**
   * Quita la hora de las pendientes si nadie la volvió a marcar desde
   * `computedFrom`: un mensaje que llega mientras se calcula la deja pendiente.
   */
  async clearPending(hour: CellHour, computedFrom: Date): Promise<void> {
    await this.db.delete(cellHourlyPending).where(
      and(
        eq(cellHourlyPending.siteId, hour.siteId),
        eq(cellHourlyPending.cellId, hour.cellId),
        eq(cellHourlyPending.hour, hour.hour),
        // Estricto: las marcas se guardan en milisegundos. En el peor caso, la
        // hora se recalcula una vez de más.
        lt(cellHourlyPending.markedAt, computedFrom),
      ),
    );
  }

  /** Agregados de una célula entre dos instantes, ordenados por hora. */
  async hours(siteId: string, cellId: string, from: Date, to: Date) {
    return this.db
      .select()
      .from(cellHourly)
      .where(
        and(
          eq(cellHourly.siteId, siteId),
          eq(cellHourly.cellId, cellId),
          gte(cellHourly.hour, from),
          lt(cellHourly.hour, to),
        ),
      )
      .orderBy(asc(cellHourly.hour));
  }
}
