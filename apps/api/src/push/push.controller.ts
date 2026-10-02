import { Body, Controller, Delete, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { ApiBodyOptions } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../auth/auth.guard.ts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import { PushRepository } from './push.repository.ts';
import { deviceSchema } from './push.schemas.ts';
import type { DeviceRequest } from './push.schemas.ts';

const deviceBody: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['token'],
    properties: { token: { type: 'string', description: 'Token de Firebase Cloud Messaging' } },
  },
};

/** Dispositivos que reciben los avisos de alarmas (ADR-0015). */
@ApiTags('Avisos')
@ApiBearerAuth()
@Controller('push/devices')
export class PushController {
  constructor(private readonly repository: PushRepository) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar el dispositivo para recibir avisos de alarmas' })
  @ApiBody(deviceBody)
  @ApiNoContentResponse({ description: 'Dispositivo registrado' })
  async register(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(deviceSchema)) body: DeviceRequest,
  ): Promise<void> {
    await this.repository.registerDevice(body.token, subjectOf(request), new Date());
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dejar de recibir avisos en el dispositivo' })
  @ApiBody(deviceBody)
  @ApiNoContentResponse({ description: 'Dispositivo dado de baja' })
  async unregister(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(deviceSchema)) body: DeviceRequest,
  ): Promise<void> {
    await this.repository.unregisterDevice(body.token, subjectOf(request));
  }
}

function subjectOf(request: AuthenticatedRequest): string {
  if (request.principal === undefined) {
    throw new Error('La guarda de autenticación no se ejecutó');
  }
  return request.principal.subject;
}
