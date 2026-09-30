import { Module } from '@nestjs/common';

import { IngestionModule } from '../ingestion/ingestion.module.ts';
import { PersistenceService } from './persistence.service.ts';
import { TelemetryRepository } from './telemetry.repository.ts';

@Module({
  imports: [IngestionModule],
  providers: [TelemetryRepository, PersistenceService],
  exports: [TelemetryRepository],
})
export class PersistenceModule {}
