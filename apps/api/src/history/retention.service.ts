import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { AppConfig } from '../config/config.ts';
import { DATABASE } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import {
  cellHourly,
  cellHourlyPending,
  cellStateChanges,
  cellStatusEvents,
  pushNotifiedAlarms,
  telemetrySamples,
} from '../database/schema.ts';

const DAY_MS = 86_400_000;
const BATCH = 5_000;
const EVERY_MS = 3_600_000;
/**
 * Los avisos ya enviados solo sirven para no repetir el de una activación, y
 * solo se avisa de las de los últimos 15 minutos (ADR-0015): basta un día.
 */
const NOTIFIED_ALARMS_DAYS = 1;

type RawTable = typeof telemetrySamples | typeof cellStateChanges | typeof cellStatusEvents;

/**
 * Borra el histórico más antiguo que la retención de cada tabla (ADR-0016 y
 * ADR-0019): el dato en bruto por lotes, para no bloquear la ingesta, y
 * conservando siempre el último mensaje de cada célula, del que se recupera el
 * estado al arrancar; después, los agregados por hora. Con retención 0, la
 * tabla no se toca. Los avisos ya enviados se borran siempre al día.
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

  get #aggregatesDays(): number {
    return this.config.get('HISTORY_AGGREGATES_RETENTION_DAYS', { infer: true });
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
      if (this.#aggregatesDays > 0) {
        const cutoff = this.#cutoff(now, this.#aggregatesDays);
        const result = await this.db.execute(sql`delete from ${cellHourly} where hour < ${cutoff}`);
        deleted += result.rowCount ?? 0;
      }
      const notified = await this.db.execute(
        sql`delete from ${pushNotifiedAlarms} where notified_at < ${this.#cutoff(now, NOTIFIED_ALARMS_DAYS)}`,
      );
      deleted += notified.rowCount ?? 0;
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
