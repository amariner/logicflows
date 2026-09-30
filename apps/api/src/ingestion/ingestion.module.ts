import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { MqttIngestionService } from './mqtt-ingestion.service.ts';
import { MqttHealthIndicator } from './mqtt.health.ts';
import { TelemetryStream } from './telemetry-stream.ts';

@Module({
  imports: [TerminusModule],
  providers: [TelemetryStream, MqttIngestionService, MqttHealthIndicator],
  exports: [TelemetryStream, MqttHealthIndicator],
})
export class IngestionModule {}
