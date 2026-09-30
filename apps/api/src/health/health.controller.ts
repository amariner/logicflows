import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { MqttHealthIndicator } from '../ingestion/mqtt.health.ts';

@ApiTags('Salud')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mqtt: MqttHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  @ApiOperation({
    summary: 'Vivacidad',
    description: 'Indica que el proceso responde. Si falla, el orquestador reinicia la API.',
  })
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Disponibilidad',
    description:
      'Indica que la API puede atender peticiones: está conectada al broker MQTT. Comprobará PostgreSQL cuando se incorpore.',
  })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.mqtt.check()]);
  }
}
