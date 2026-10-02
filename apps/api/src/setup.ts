import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import { PinoLogger } from 'nestjs-pino';

import { ProblemDetailsFilter } from './common/problem-details.ts';
import type { AppConfig } from './config/config.ts';
import { setupOpenApi } from './openapi.ts';
import { applyHttpSecurity } from './security/http-security.ts';

/** Prefijo de la API REST. La versión mayor forma parte de la ruta. */
export const REST_PREFIX = 'api/v1';

/**
 * Configuración común de la aplicación, compartida por el arranque y las
 * pruebas: cabeceras de seguridad, prefijo de la API REST, CORS, formato de
 * errores, WebSocket y OpenAPI.
 */
export async function configureApp(app: INestApplication): Promise<void> {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  applyHttpSecurity(app, config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.setGlobalPrefix(REST_PREFIX, { exclude: ['health/live', 'health/ready', 'metrics'] });
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.useGlobalFilters(new ProblemDetailsFilter(await app.resolve(PinoLogger)));
  app.useWebSocketAdapter(new WsAdapter(app));
  setupOpenApi(app);
}
