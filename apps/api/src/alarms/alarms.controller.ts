import { Body, Controller, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import type { AlarmAcknowledgement } from '@logicflows/contract';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { problemSchema } from '../cells/openapi.schemas.ts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import { acknowledgementBodySchema, alarmParamsSchema } from './alarms.schemas.ts';
import type { AcknowledgementBody, AlarmParams } from './alarms.schemas.ts';
import { AlarmsService } from './alarms.service.ts';

const acknowledgementSchema = {
  type: 'object' as const,
  required: ['code', 'raisedAt', 'acknowledgedBy', 'acknowledgedAt'],
  properties: {
    code: { type: 'string' as const, example: 'ROB-001' },
    raisedAt: { type: 'string' as const, format: 'date-time' },
    acknowledgedBy: { type: 'string' as const, description: 'Nombre de usuario' },
    acknowledgedAt: {
      type: 'string' as const,
      format: 'date-time',
      description: 'Hora del servidor',
    },
  },
};

@ApiTags('Alarmas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido', schema: problemSchema })
@ApiForbiddenResponse({ description: 'Hace falta el rol operator', schema: problemSchema })
@ApiBadRequestResponse({ description: 'Parámetros no válidos', schema: problemSchema })
@Controller('sites/:siteId/cells/:cellId/alarms/:code/acknowledgements')
export class AlarmsController {
  constructor(private readonly alarms: AlarmsService) {}

  @Post()
  @RequireRole('operator')
  @ApiOperation({
    summary: 'Reconocer una alarma activa',
    description:
      'Registra quién atiende la activación y cuándo, con la hora del servidor. No resuelve la alarma ni llega a la célula: sigue activa hasta que la célula la resuelve. Si ya estaba reconocida, devuelve ese reconocimiento (ADR-0022).',
  })
  @ApiParam({ name: 'siteId', example: 'demo' })
  @ApiParam({ name: 'cellId', example: 'cell-01' })
  @ApiParam({ name: 'code', example: 'ROB-001', description: 'Código de la alarma' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['raisedAt'],
      properties: {
        raisedAt: {
          type: 'string',
          format: 'date-time',
          description: 'Cuándo se activó: identifica la activación',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Alarma reconocida', schema: acknowledgementSchema })
  @ApiOkResponse({ description: 'Ya estaba reconocida', schema: acknowledgementSchema })
  @ApiNotFoundResponse({ description: 'Célula desconocida', schema: problemSchema })
  @ApiConflictResponse({ description: 'La alarma no está activa', schema: problemSchema })
  async acknowledge(
    @Param(new ZodValidationPipe(alarmParamsSchema)) params: AlarmParams,
    @Body(new ZodValidationPipe(acknowledgementBodySchema)) body: AcknowledgementBody,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AlarmAcknowledgement> {
    if (request.principal === undefined) {
      throw new Error('La guarda de autenticación no se ejecutó');
    }
    const result = await this.alarms.acknowledge(
      params.siteId,
      params.cellId,
      params.code,
      body.raisedAt,
      request.principal,
      request.ip,
    );
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.acknowledgement;
  }
}
