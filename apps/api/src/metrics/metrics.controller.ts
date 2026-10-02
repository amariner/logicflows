import { createHash, timingSafeEqual } from 'node:crypto';

import {
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

import { Public } from '../auth/decorators.ts';
import type { AppConfig } from '../config/config.ts';
import { MetricsService } from './metrics.service.ts';

/** Compara en tiempo constante; el resumen iguala las longitudes. */
function sameSecret(received: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

/**
 * Métricas en formato de texto de Prometheus para Grafana Cloud (ADR-0013).
 * No usa los tokens de Keycloak: quien las recoge es un servicio, no una
 * persona, y se identifica con un secreto propio (`METRICS_TOKEN`). Sin ese
 * secreto la ruta no existe, como en las previsualizaciones.
 */
@ApiExcludeController()
@Public()
// Grafana Cloud las recoge cada minuto; no debe agotar el límite de nadie.
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const expected = this.config.get('METRICS_TOKEN', { infer: true });
    if (expected === undefined) {
      throw new NotFoundException();
    }
    const [scheme, token] = (authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || token === undefined || !sameSecret(token, expected)) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      throw new UnauthorizedException('Falta el token de las métricas o no es válido');
    }
    response.type(this.metrics.registry.contentType);
    return this.metrics.registry.metrics();
  }
}
