import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { RequestHandler } from 'express';
import helmet from 'helmet';

import { OPENAPI_PATH } from '../openapi.ts';

/** Tamaño máximo del cuerpo de una petición: la API solo recibe peticiones pequeñas. */
export const MAX_BODY_SIZE = '16kb';

/**
 * Cabeceras de seguridad (LF-52). Las respuestas de la API son JSON y no
 * deben cargar nada; la documentación OpenAPI es una página y usa la política
 * por defecto de helmet.
 */
export function applyHttpSecurity(app: INestApplication, trustProxyHops: number): void {
  const express = app as NestExpressApplication;
  express.set('trust proxy', trustProxyHops);
  express.useBodyParser('json', { limit: MAX_BODY_SIZE });

  const api = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  });
  const docs = helmet();
  const handler: RequestHandler = (request, response, next) => {
    const target = request.path.startsWith(`/${OPENAPI_PATH}`) ? docs : api;
    target(request, response, next);
  };
  express.use(handler);
}
