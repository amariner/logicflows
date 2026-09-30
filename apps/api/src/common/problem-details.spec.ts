import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter, ValidationProblem } from './problem-details.ts';

const respond = (exception: unknown, url = '/api/v1/cells') => {
  const logger = { setContext: vi.fn(), error: vi.fn() };
  const response = {
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter(logger as unknown as PinoLogger).catch(exception, host);
  return { response, logger };
};

describe('formato de errores (RFC 9457)', () => {
  it('responde application/problem+json con el estado y el detalle', () => {
    const { response } = respond(new NotFoundException('No hay datos de la célula demo/x'));
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.type).toHaveBeenCalledWith('application/problem+json');
    expect(response.json).toHaveBeenCalledWith({
      type: 'about:blank',
      title: 'Recurso no encontrado',
      status: 404,
      detail: 'No hay datos de la célula demo/x',
      instance: '/api/v1/cells',
    });
  });

  it('incluye los campos no válidos en los errores de validación', () => {
    const errors = [{ field: 'from', message: 'Fecha no válida' }];
    const { response } = respond(new ValidationProblem(errors));
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, title: 'Petición no válida', errors }),
    );
  });

  it('oculta los detalles de los errores inesperados y los registra', () => {
    const { response, logger } = respond(new Error('conexión rechazada en 10.0.0.5'));
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error interno',
        detail: 'Se ha producido un error inesperado',
      }),
    );
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('conserva el formato de Terminus en las comprobaciones de salud', () => {
    const health = { status: 'error', details: { mqtt: { status: 'down' } } };
    const { response } = respond(new ServiceUnavailableException(health), '/health/ready');
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(health);
  });
});
