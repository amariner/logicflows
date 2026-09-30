import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';

import { MqttIngestionService } from './mqtt-ingestion.service.ts';

/** Indica si la API está conectada al broker MQTT. */
@Injectable()
export class MqttHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly ingestion: MqttIngestionService,
  ) {}

  check(): HealthIndicatorResult<'mqtt'> {
    const indicator = this.indicators.check('mqtt');
    return this.ingestion.connected
      ? indicator.up()
      : indicator.down({ message: 'Sin conexión con el broker' });
  }
}
