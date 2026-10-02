import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { AppConfig } from '../config/config.ts';
import { DATABASE } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import {
  cellHourlyPending,
  cellStateChanges,
  cellStatusEvents,
  telemetrySamples,
} from '../database/schema.ts';

const DAY_MS = 86_400_000;
const BATCH = 5_000;
const EVERY_MS = 3_600_000;

type RawTable = typeof telemetrySamples | typeof cellStateChanges | typeof cellStatusEvents;

/**
 * Borra el dato en bruto más antiguo que la retención (ADR-0016), por lotes
 * para no bloquear la ingesta. Conserva siempre el último mensaje de cada
 * célula, del que se recupera el estado al arrancar. Con retención 0 no borra
 * nada.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  #timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectPinoLogger(RetentionService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    if (this.#rawDays === 0 && this.#eventsDays === 0) {
      return;
    }
    this.#timer = setInterval(() => {
      void this.runOnce();
    }, EVERY_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.#timer);
  }

  get #rawDays(): number {
    return this.config.get('HISTORY_RAW_RETENTION_DAYS', { infer: true });
  }

  get #eventsDays(): number {
    return this.config.get('HISTORY_EVENTS_RETENTION_DAYS', { infer: true });
  }

  /** Aplica la retención una vez. Devuelve cuántas filas borró. */
  async runOnce(now = new Date()): Promise<number> {
    let deleted = 0;
    try {
      if (this.#rawDays > 0) {
        deleted += await this.#purge(telemetrySamples, this.#cutoff(now, this.#rawDays));
      }
      if (this.#eventsDays > 0) {
        const cutoff = this.#cutoff(now, this.#eventsDays);
        deleted += await this.#purge(cellStateChanges, cutoff);
        deleted += await this.#purge(cellStatusEvents, cutoff);
      }
      if (deleted > 0) {
        this.logger.info({ deleted }, 'Retención del histórico aplicada');
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'No se pudo aplicar la retención del histórico',
      );
    }
    return deleted;
  }

  #cutoff(now: Date, days: number): Date {
    return new Date(now.getTime() - days * DAY_MS);
  }

  async #purge(table: RawTable, cutoff: Date): Promise<number> {
    // Una hora todavía pendiente no se ha agregado: su dato en bruto se espera.
    const pending = await this.db.execute<{ found: boolean }>(
      sql`select exists (select 1 from ${cellHourlyPending} where hour < ${cutoff}) as found`,
    );
    if (pending.rows[0]?.found === true) {
      this.logger.warn({ cutoff }, 'Hay horas antiguas sin agregar: la retención espera');
      return 0;
    }
    let total = 0;
    for (;;) {
      const result = await this.db.execute(sql`
        delete from ${table}
        where id in (
          select id from ${table} as old
          where old.source_timestamp < ${cutoff}
            and old.id <> (
              select latest.id from ${table} as latest
              where latest.site_id = old.site_id and latest.cell_id = old.cell_id
              order by latest.source_timestamp desc
              limit 1
            )
          limit ${BATCH}
        )
      `);
      const count = result.rowCount ?? 0;
      total += count;
      if (count < BATCH) {
        return total;
      }
    }
  }
}
