import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { IngestionModule } from '../ingestion/ingestion.module.ts';
import { HealthController } from './health.controller.ts';

@Module({
  imports: [TerminusModule.forRoot({ logger: false }), IngestionModule],
  controllers: [HealthController],
})
export class HealthModule {}
