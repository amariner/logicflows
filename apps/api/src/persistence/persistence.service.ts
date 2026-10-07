import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { DecodedMessage } from '@logicflows/contract';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { concatMap } from 'rxjs';
import type { Subscription } from 'rxjs';

import { DATABASE } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import { HistoryRepository, hourOf } from '../history/history.repository.ts';
import type { CellHour } from '../history/history.repository.ts';
import { HOUR_MS } from '../history/hour-summary.ts';
import { TelemetryStream } from '../ingestion/telemetry-stream.ts';
import type { IngestedMessage } from '../ingestion/telemetry-stream.ts';
import { TelemetryRepository } from './telemetry.repository.ts';

/**
 * Guarda en PostgreSQL cada mensaje aceptado por la ingesta, de uno en uno y
 * en el orden de llegada. Un error al guardar se registra y no detiene el
 * flujo.
 *
 * El mensaje y la marca de sus horas del histórico se guardan en la misma
 * transacción: si la API cae o PostgreSQL falla entre los dos, no queda un
 * mensaje guardado cuya hora no se vuelva a agregar (LF-114).
 */
@Injectable()
export class PersistenceService implements OnModuleInit, OnModuleDestroy {
  #subscription: Subscription | undefined;

  constructor(
    private readonly stream: TelemetryStream,
    @Inject(DATABASE) private readonly db: Database,
    @InjectPinoLogger(PersistenceService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.#subscription = this.stream.messages$
      .pipe(concatMap((message) => this.#save(message)))
      .subscribe();
  }

  onModuleDestroy(): void {
    this.#subscription?.unsubscribe();
  }

  async #save({ decoded, receivedAt }: IngestedMessage): Promise<void> {
    try {
      const inserted = await this.db.transaction(async (tx) => {
        if (!(await new TelemetryRepository(tx).save(decoded, receivedAt))) {
          return false;
        }
        await new HistoryRepository(tx).markPending(hoursAffectedBy(decoded));
        return true;
      });
      if (!inserted) {
        this.logger.debug({ kind: decoded.kind }, 'Mensaje ya guardado');
      }
    } catch (error) {
      this.logger.error(
        { kind: decoded.kind, error: error instanceof Error ? error.message : String(error) },
        'No se pudo guardar el mensaje',
      );
    }
  }
}

/**
 * Horas del histórico que hay que recalcular por un mensaje (ADR-0016). Un
 * estado o una conexión sigue vigente en la hora siguiente: también se marca.
 */
function hoursAffectedBy(decoded: DecodedMessage): CellHour[] {
  const { siteId, cellId, timestamp } = decoded.message;
  const hour = hourOf(new Date(timestamp));
  const hours = [{ siteId, cellId, hour }];
  if (decoded.kind !== 'telemetry') {
    hours.push({ siteId, cellId, hour: new Date(hour.getTime() + HOUR_MS) });
  }
  return hours;
}
