import { Global, Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller.ts';
import { MetricsService } from './metrics.service.ts';

/** Registro de métricas compartido por todos los módulos de la API (ADR-0013). */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
