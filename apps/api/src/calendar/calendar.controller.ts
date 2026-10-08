import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/auth.guard.ts';
import { RequireRole } from '../auth/decorators.ts';
import type { Principal } from '../auth/roles.ts';
import { problemSchema } from '../cells/openapi.schemas.ts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import {
  exceptionBodySchema,
  exceptionParamsSchema,
  siteParamsSchema,
  versionBodySchema,
  versionParamsSchema,
} from './calendar.schemas.ts';
import type {
  ExceptionBody,
  ExceptionParams,
  SiteParams,
  VersionBody,
  VersionParams,
} from './calendar.schemas.ts';
import { CalendarService } from './calendar.service.ts';
import type { CalendarView, ExceptionView, VersionView } from './calendar.service.ts';
import {
  calendarSchema,
  exceptionBodyOpenApi,
  exceptionSchema,
  versionBodyOpenApi,
  versionSchema,
} from './openapi.schemas.ts';

const FUTURE_ONLY =
  'Solo a partir de mañana, en la hora local de la planta: las versiones vigentes y pasadas no se modifican, para que los indicadores ya enseñados no cambien (ADR-0021).';

@ApiTags('Calendario de turnos')
@ApiBearerAuth()
@ApiParam({ name: 'siteId', example: 'demo', description: 'Planta' })
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido', schema: problemSchema })
@ApiForbiddenResponse({
  description: 'El usuario no tiene el rol necesario',
  schema: problemSchema,
})
@ApiBadRequestResponse({ description: 'Parámetros no válidos', schema: problemSchema })
@Controller('sites/:siteId/calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @ApiOperation({
    summary: 'Calendario de turnos de una planta',
    description:
      'La versión vigente y las futuras, con sus turnos semanales, y las excepciones del último mes y futuras. Sin calendario, los indicadores tratan todas las horas como fuera de turno (ADR-0021).',
  })
  @ApiOkResponse({ schema: calendarSchema })
  get(@Param(new ZodValidationPipe(siteParamsSchema)) params: SiteParams): Promise<CalendarView> {
    return this.calendar.view(params.siteId);
  }

  @Put('versions/:effectiveFrom')
  @RequireRole('admin')
  @ApiOperation({
    summary: 'Crear o sustituir una versión futura del calendario',
    description: `Los turnos empiezan y terminan en horas en punto; si un turno termina antes de empezar, cruza la medianoche. No pueden solaparse. ${FUTURE_ONLY}`,
  })
  @ApiParam({
    name: 'effectiveFrom',
    example: '2026-10-19',
    description: 'Fecha de entrada en vigor',
  })
  @ApiBody({ schema: versionBodyOpenApi })
  @ApiCreatedResponse({ description: 'Versión creada', schema: versionSchema })
  @ApiOkResponse({ description: 'Versión sustituida', schema: versionSchema })
  @ApiConflictResponse({ description: 'La fecha no es futura', schema: problemSchema })
  async saveVersion(
    @Param(new ZodValidationPipe(versionParamsSchema)) params: VersionParams,
    @Body(new ZodValidationPipe(versionBodySchema)) body: VersionBody,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VersionView> {
    const result = await this.calendar.saveVersion(
      params.siteId,
      params.effectiveFrom,
      body,
      principalOf(request),
    );
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.version;
  }

  @Delete('versions/:effectiveFrom')
  @RequireRole('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar una versión futura del calendario', description: FUTURE_ONLY })
  @ApiParam({
    name: 'effectiveFrom',
    example: '2026-10-19',
    description: 'Fecha de entrada en vigor',
  })
  @ApiNoContentResponse({ description: 'Versión borrada' })
  @ApiNotFoundResponse({ description: 'No existe esa versión', schema: problemSchema })
  @ApiConflictResponse({
    description: 'La versión ya está vigente o es pasada',
    schema: problemSchema,
  })
  async deleteVersion(
    @Param(new ZodValidationPipe(versionParamsSchema)) params: VersionParams,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.calendar.deleteVersion(params.siteId, params.effectiveFrom, principalOf(request));
  }

  @Put('exceptions/:date')
  @RequireRole('admin')
  @ApiOperation({
    summary: 'Marcar un día futuro sin turnos',
    description: `Festivo, vacaciones o parada por mantenimiento. Hace falta una versión del calendario vigente ese día. ${FUTURE_ONLY}`,
  })
  @ApiParam({ name: 'date', example: '2026-11-02', description: 'Fecha local' })
  @ApiBody({ schema: exceptionBodyOpenApi })
  @ApiCreatedResponse({ description: 'Excepción creada', schema: exceptionSchema })
  @ApiOkResponse({ description: 'Excepción sustituida', schema: exceptionSchema })
  @ApiConflictResponse({
    description: 'La fecha no es futura o no tiene calendario',
    schema: problemSchema,
  })
  async saveException(
    @Param(new ZodValidationPipe(exceptionParamsSchema)) params: ExceptionParams,
    @Body(new ZodValidationPipe(exceptionBodySchema)) body: ExceptionBody,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ExceptionView> {
    const result = await this.calendar.saveException(
      params.siteId,
      params.date,
      body,
      principalOf(request),
    );
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.exception;
  }

  @Delete('exceptions/:date')
  @RequireRole('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar la excepción de un día futuro', description: FUTURE_ONLY })
  @ApiParam({ name: 'date', example: '2026-11-02', description: 'Fecha local' })
  @ApiNoContentResponse({ description: 'Excepción borrada' })
  @ApiNotFoundResponse({ description: 'No existe esa excepción', schema: problemSchema })
  @ApiConflictResponse({ description: 'La fecha no es futura', schema: problemSchema })
  async deleteException(
    @Param(new ZodValidationPipe(exceptionParamsSchema)) params: ExceptionParams,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.calendar.deleteException(params.siteId, params.date, principalOf(request));
  }
}

function principalOf(request: AuthenticatedRequest): Principal {
  if (request.principal === undefined) {
    throw new Error('La guarda de autenticación no se ejecutó');
  }
  return request.principal;
}
