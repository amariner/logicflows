import { Inject, Injectable } from '@nestjs/common';
import type { CellSnapshot, DecodedMessage } from '@logicflows/contract';
import { sql } from 'drizzle-orm';

import { DATABASE } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import { cellStateChanges, cellStatusEvents, telemetrySamples } from '../database/schema.ts';
import { stateFromRow, statusFromRow, telemetryFromRow, toRow } from './mappers.ts';

export interface ProductionTotals {
  readonly boxes: number;
  readonly pallets: number;
}

const keyOf = (siteId: string, cellId: string) => `${siteId}/${cellId}`;

/** Acceso a los mensajes guardados de las células. */
@Injectable()
export class TelemetryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Guarda un mensaje. Devuelve `false` si ya estaba guardado: la restricción
   * única sobre la identidad del mensaje hace que un duplicado no cuente dos
   * veces (ADR-0007).
   */
  async save(decoded: DecodedMessage, receivedAt: string): Promise<boolean> {
    const insert = toRow(decoded, receivedAt);
    let inserted: unknown[];
    switch (insert.kind) {
      case 'status':
        inserted = await this.db
          .insert(cellStatusEvents)
          .values(insert.row)
          .onConflictDoNothing()
          .returning({ id: cellStatusEvents.id });
        break;
      case 'state':
        inserted = await this.db
          .insert(cellStateChanges)
          .values(insert.row)
          .onConflictDoNothing()
          .returning({ id: cellStateChanges.id });
        break;
      case 'telemetry':
        inserted = await this.db
          .insert(telemetrySamples)
          .values(insert.row)
          .onConflictDoNothing()
          .returning({ id: telemetrySamples.id });
        break;
    }
    return inserted.length > 0;
  }

  /** Último mensaje de cada tipo de todas las células conocidas. */
  async latestSnapshots(): Promise<CellSnapshot[]> {
    const [statuses, states, telemetries] = await Promise.all([
      this.db
        .selectDistinctOn([cellStatusEvents.siteId, cellStatusEvents.cellId])
        .from(cellStatusEvents)
        .orderBy(
          cellStatusEvents.siteId,
          cellStatusEvents.cellId,
          sql`${cellStatusEvents.sourceTimestamp} desc`,
        ),
      this.db
        .selectDistinctOn([cellStateChanges.siteId, cellStateChanges.cellId])
        .from(cellStateChanges)
        .orderBy(
          cellStateChanges.siteId,
          cellStateChanges.cellId,
          sql`${cellStateChanges.sourceTimestamp} desc`,
          sql`${cellStateChanges.seq} desc`,
        ),
      this.db
        .selectDistinctOn([telemetrySamples.siteId, telemetrySamples.cellId])
        .from(telemetrySamples)
        .orderBy(
          telemetrySamples.siteId,
          telemetrySamples.cellId,
          sql`${telemetrySamples.sourceTimestamp} desc`,
          sql`${telemetrySamples.seq} desc`,
        ),
    ]);

    const cells = new Map<string, CellSnapshot>();
    const cell = (siteId: string, cellId: string): CellSnapshot =>
      cells.get(keyOf(siteId, cellId)) ?? {
        siteId,
        cellId,
        status: null,
        state: null,
        telemetry: null,
      };
    for (const row of statuses) {
      cells.set(keyOf(row.siteId, row.cellId), {
        ...cell(row.siteId, row.cellId),
        status: statusFromRow(row),
      });
    }
    for (const row of states) {
      cells.set(keyOf(row.siteId, row.cellId), {
        ...cell(row.siteId, row.cellId),
        state: stateFromRow(row),
      });
    }
    for (const row of telemetries) {
      cells.set(keyOf(row.siteId, row.cellId), {
        ...cell(row.siteId, row.cellId),
        telemetry: telemetryFromRow(row),
      });
    }
    return [...cells.values()];
  }

  /**
   * Cajas y pallets producidos en [from, to). Suma las diferencias entre
   * muestras consecutivas de cada sesión (ADR-0004): la primera muestra de una
   * sesión y un contador que disminuye (reinicio) cuentan desde cero.
   */
  async production(
    siteId: string,
    cellId: string,
    from: Date,
    to: Date,
  ): Promise<ProductionTotals> {
    const result = await this.db.execute<{ boxes: string | null; pallets: string | null }>(sql`
      with samples as (
        select
          source_timestamp,
          boxes_total,
          pallets_total,
          lag(boxes_total) over session_order as previous_boxes,
          lag(pallets_total) over session_order as previous_pallets
        from ${telemetrySamples}
        where site_id = ${siteId} and cell_id = ${cellId} and source_timestamp < ${to}
        window session_order as (partition by session_id order by seq)
      )
      select
        sum(case when previous_boxes is null or boxes_total < previous_boxes
                 then boxes_total else boxes_total - previous_boxes end) as boxes,
        sum(case when previous_pallets is null or pallets_total < previous_pallets
                 then pallets_total else pallets_total - previous_pallets end) as pallets
      from samples
      where source_timestamp >= ${from}
    `);
    const row = result.rows[0];
    return { boxes: Number(row?.boxes ?? 0), pallets: Number(row?.pallets ?? 0) };
  }
}
