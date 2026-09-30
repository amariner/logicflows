import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Salud')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

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
      'Indica que la API puede atender peticiones: comprobará el broker MQTT y PostgreSQL cuando se incorporen.',
  })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}
