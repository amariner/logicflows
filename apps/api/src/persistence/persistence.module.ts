import { Module } from '@nestjs/common';

import { HistoryModule } from '../history/history.module.ts';
import { IngestionModule } from '../ingestion/ingestion.module.ts';
import { AcknowledgementRepository } from './acknowledgement.repository.ts';
import { PersistenceService } from './persistence.service.ts';
import { TelemetryRepository } from './telemetry.repository.ts';

@Module({
  imports: [IngestionModule, HistoryModule],
  providers: [TelemetryRepository, AcknowledgementRepository, PersistenceService],
  exports: [TelemetryRepository, AcknowledgementRepository],
})
export class PersistenceModule {}
