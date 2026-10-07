import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Gauge } from 'prom-client';

import type { AppConfig } from '../config/config.ts';
import { METRIC_PREFIX, MetricsService } from '../metrics/metrics.service.ts';
import { HistoryRepository } from './history.repository.ts';
import { HOUR_MS, summarizeHour } from './hour-summary.ts';

/** Horas que se recalculan como mucho en cada pasada. */
const BATCH = 200;

/**
 * Recalcula los agregados por hora de las horas pendientes (ADR-0016). Una
 * sola réplica trabaja a la vez, gracias al bloqueo consultivo; el resultado
 * no depende de cuántas veces se calcule una hora.
 */
@Injectable()
export class HistoryAggregator implements OnModuleInit, OnModuleDestroy {
  #timer: NodeJS.Timeout | undefined;
  #running = false;

  constructor(
    private readonly repository: HistoryRepository,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectPinoLogger(HistoryAggregator.name) private readonly logger: PinoLogger,
    metrics: MetricsService,
  ) {
    new Gauge({
      name: `${METRIC_PREFIX}history_pending_hours`,
      help: 'Horas de células pendientes de agregar en el histórico.',
      registers: [metrics.registry],
      async collect() {
        this.set(await repository.pendingCount());
      },
    });
  }

  onModuleInit(): void {
    this.#timer = setInterval(
      () => {
        void this.runOnce();
      },
      this.config.get('HISTORY_AGGREGATION_INTERVAL_MS', { infer: true }),
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.#timer);
  }

  /** Recalcula un lote de horas pendientes. Devuelve cuántas. */
  async runOnce(): Promise<number> {
    if (this.#running) {
      return 0;
    }
    this.#running = true;
    let processed = 0;
    try {
      await this.repository.exclusively(async (repository) => {
        for (const pending of await repository.oldestPending(BATCH)) {
          const computedFrom = await repository.clock();
          const timeline = await repository.hourTimeline(pending);
          const production = await repository.hourProduction(pending);
          await repository.saveHour(
            pending,
            summarizeHour({ ...timeline, ...production, until: computedFrom.getTime() }),
            computedFrom,
          );
          // Una hora que no ha terminado sigue pendiente: se completa en las
          // siguientes pasadas, aunque la célula no envíe nada más.
          if (computedFrom.getTime() >= pending.hour.getTime() + HOUR_MS) {
            await repository.clearPending(pending);
          }
          processed++;
        }
      });
      if (processed > 0) {
        this.logger.debug({ hours: processed }, 'Horas del histórico agregadas');
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'No se pudo agregar el histórico',
      );
    } finally {
      this.#running = false;
    }
    return processed;
  }
}
