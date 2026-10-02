import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { concatMap } from 'rxjs';
import type { Subscription } from 'rxjs';

import { HistoryRepository, hourOf } from '../history/history.repository.ts';
import { HOUR_MS } from '../history/hour-summary.ts';
import { TelemetryStream } from '../ingestion/telemetry-stream.ts';
import type { IngestedMessage } from '../ingestion/telemetry-stream.ts';
import { TelemetryRepository } from './telemetry.repository.ts';

/**
 * Guarda en PostgreSQL cada mensaje aceptado por la ingesta, de uno en uno y
 * en el orden de llegada. Un error al guardar se registra y no detiene el
 * flujo.
 */
@Injectable()
export class PersistenceService implements OnModuleInit, OnModuleDestroy {
  #subscription: Subscription | undefined;

  constructor(
    private readonly stream: TelemetryStream,
    private readonly repository: TelemetryRepository,
    private readonly history: HistoryRepository,
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
      const inserted = await this.repository.save(decoded, receivedAt);
      if (!inserted) {
        this.logger.debug({ kind: decoded.kind }, 'Mensaje ya guardado');
        return;
      }
      // Su hora del histórico se recalculará (ADR-0016). Un estado o una
      // conexión sigue vigente en la hora siguiente: también se marca.
      const { siteId, cellId, timestamp } = decoded.message;
      const hour = hourOf(new Date(timestamp));
      const hours = [{ siteId, cellId, hour }];
      if (decoded.kind !== 'telemetry') {
        hours.push({ siteId, cellId, hour: new Date(hour.getTime() + HOUR_MS) });
      }
      await this.history.markPending(hours);
    } catch (error) {
      this.logger.error(
        { kind: decoded.kind, error: error instanceof Error ? error.message : String(error) },
        'No se pudo guardar el mensaje',
      );
    }
  }
}
