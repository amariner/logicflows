import { sql } from 'drizzle-orm';

import type { Database } from '../database/database.module.ts';
import { telemetrySamples } from '../database/schema.ts';

export interface ProductionTotals {
  readonly boxes: number;
  readonly pallets: number;
}

/**
 * Cajas y palés producidos en [from, to), leídos del dato en bruto. Suma las
 * diferencias entre muestras consecutivas de cada sesión (ADR-0004): la
 * primera muestra de una sesión y un contador que disminuye (reinicio) cuentan
 * desde cero. Solo lee el periodo y la última muestra anterior de cada sesión,
 * así que cuesta lo mismo con un día de histórico que con un año (ADR-0016).
 */
export async function rawProduction(
  db: Database,
  siteId: string,
  cellId: string,
  from: Date,
  to: Date,
): Promise<ProductionTotals> {
  const result = await db.execute<{ boxes: string | null; pallets: string | null }>(sql`
    with in_period as (
      select session_id, seq, source_timestamp, boxes_total, pallets_total
      from ${telemetrySamples}
      where site_id = ${siteId} and cell_id = ${cellId}
        and source_timestamp >= ${from} and source_timestamp < ${to}
    ),
    previous as (
      select before.session_id, before.seq, before.source_timestamp,
             before.boxes_total, before.pallets_total
      from (select distinct session_id from in_period) as sessions
      cross join lateral (
        select session_id, seq, source_timestamp, boxes_total, pallets_total
        from ${telemetrySamples}
        where site_id = ${siteId} and cell_id = ${cellId}
          and session_id = sessions.session_id and source_timestamp < ${from}
        order by seq desc
        limit 1
      ) as before
    ),
    samples as (
      select source_timestamp, boxes_total, pallets_total,
             lag(boxes_total) over w as previous_boxes,
             lag(pallets_total) over w as previous_pallets
      from (select * from previous union all select * from in_period) as all_samples
      window w as (partition by session_id order by seq)
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
