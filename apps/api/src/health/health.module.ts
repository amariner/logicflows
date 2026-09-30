import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DatabaseHealthIndicator } from '../database/database.health.ts';
import { IngestionModule } from '../ingestion/ingestion.module.ts';
import { HealthController } from './health.controller.ts';

@Module({
  imports: [TerminusModule.forRoot({ logger: false }), IngestionModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}
