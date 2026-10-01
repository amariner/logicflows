import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../auth/decorators.ts';
import { DatabaseHealthIndicator } from '../database/database.health.ts';
import { MqttHealthIndicator } from '../ingestion/mqtt.health.ts';

@ApiTags('Salud')
@Public()
// Los orquestadores consultan la salud cada pocos segundos.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mqtt: MqttHealthIndicator,
    private readonly database: DatabaseHealthIndicator,
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
      'Indica que la API puede atender peticiones: está conectada al broker MQTT y a PostgreSQL.',
  })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.mqtt.check(), () => this.database.check()]);
  }
}
