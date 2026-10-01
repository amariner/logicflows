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

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Las comprobaciones de salud conservan el formato estándar de Terminus,
    // con el detalle de cada dependencia, que es el que leen los orquestadores.
    if (exception instanceof HttpException && request.url.startsWith('/health')) {
      response.status(status).json(exception.getResponse());
      return;
    }
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        { error: exception instanceof Error ? exception.message : String(exception) },
        'Error no controlado',
      );
    } else if (status >= 500) {
      this.logger.warn({ status, error: exception.message }, 'Servicio no disponible');
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: TITLES[status] ?? 'Error',
      status,
      detail:
        exception instanceof HttpException
          ? exception.message
          : 'Se ha producido un error inesperado',
      instance: request.url,
      ...(exception instanceof ValidationProblem ? { errors: exception.errors } : {}),
    };
    response.status(status).type('application/problem+json').json(problem);
  }
}
