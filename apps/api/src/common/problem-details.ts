import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

/** Error de un campo de la petición. */
export interface FieldError {
  readonly field: string;
  readonly message: string;
}

/** Respuesta de error según RFC 9457 (Problem Details for HTTP APIs). */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly errors?: readonly FieldError[];
}

const TITLES: Readonly<Partial<Record<number, string>>> = {
  400: 'Petición no válida',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'Recurso no encontrado',
  405: 'Método no permitido',
  413: 'Petición demasiado grande',
  429: 'Demasiadas peticiones',
  500: 'Error interno',
  503: 'Servicio no disponible',
};

/** Petición no válida con el detalle de cada campo incorrecto. */
export class ValidationProblem extends HttpException {
  constructor(readonly errors: readonly FieldError[]) {
    super('La petición contiene parámetros no válidos', HttpStatus.BAD_REQUEST);
  }
}

/**
 * Errores de cliente que generan los middlewares de Express antes de llegar a
 * NestJS, como un JSON mal formado (400) o un cuerpo demasiado grande (413).
 */
function middlewareClientError(exception: unknown): { status: number; detail: string } | null {
  if (typeof exception !== 'object' || exception === null) {
    return null;
  }
  const { status, expose } = exception as { status?: unknown; expose?: unknown };
  if (typeof status !== 'number' || status < 400 || status >= 500 || expose !== true) {
    return null;
  }
  return {
    status,
    detail: status === 413 ? 'La petición supera el tamaño máximo' : 'La petición no es válida',
  };
}

/**
 * Convierte cualquier error en una respuesta `application/problem+json` con
 * un formato común. Los errores inesperados se registran y se responden sin
 * detalles internos.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ProblemDetailsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ url: string }>();
    const response = http.getResponse<Response>();

    const clientError = middlewareClientError(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (clientError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    // Las comprobaciones de salud conservan el formato estándar de Terminus,
    // con el detalle de cada dependencia, que es el que leen los orquestadores.
    if (exception instanceof HttpException && request.url.startsWith('/health')) {
      response.status(status).json(exception.getResponse());
      return;
    }
    if (!(exception instanceof HttpException) && clientError === null) {
      this.logger.error(
        { error: exception instanceof Error ? exception.message : String(exception) },
        'Error no controlado',
      );
    } else if (exception instanceof HttpException && status >= 500) {
      this.logger.warn({ status, error: exception.message }, 'Servicio no disponible');
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: TITLES[status] ?? 'Error',
      status,
      detail:
        exception instanceof HttpException
          ? exception.message
          : (clientError?.detail ?? 'Se ha producido un error inesperado'),
      instance: request.url,
      ...(exception instanceof ValidationProblem ? { errors: exception.errors } : {}),
    };
    response.status(status).type('application/problem+json').json(problem);
  }
}
