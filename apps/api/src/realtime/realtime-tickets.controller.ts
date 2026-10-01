import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../auth/auth.guard.ts';
import { RealtimeTickets } from './realtime-tickets.ts';
import type { IssuedTicket } from './realtime-tickets.ts';

@ApiTags('Tiempo real')
@ApiBearerAuth()
@Controller('realtime/tickets')
export class RealtimeTicketsController {
  constructor(private readonly tickets: RealtimeTickets) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tique para abrir el canal de tiempo real',
    description:
      'Devuelve un tique de un solo uso, válido 30 segundos, para conectar a /realtime?ticket=… (ADR-0009).',
  })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      required: ['ticket', 'expiresAt'],
      properties: {
        ticket: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  issue(@Req() request: AuthenticatedRequest): Promise<IssuedTicket> {
    if (request.principal === undefined) {
      throw new Error('La guarda de autenticación no se ejecutó');
    }
    return this.tickets.issue(request.principal);
  }
}
