import { Module } from '@nestjs/common';

import { HistoryAggregator } from './history-aggregator.ts';
import { HistoryRepository } from './history.repository.ts';
import { RetentionService } from './retention.service.ts';

/** Histórico agregado por hora y retención del dato en bruto (ADR-0016). */
@Module({
  providers: [HistoryRepository, HistoryAggregator, RetentionService],
  exports: [HistoryRepository],
})
export class HistoryModule {}
