import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AlarmAcknowledgement } from '@logicflows/contract';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Principal } from '../auth/roles.ts';
import {
  AcknowledgementRepository,
  toAcknowledgement,
} from '../persistence/acknowledgement.repository.ts';
import { CellStateStore } from '../realtime/cell-state.store.ts';

/**
 * Reconocimiento de alarmas (ADR-0022): registra quién atiende una alarma
 * activa y cuándo, sin resolverla ni actuar sobre la célula.
 */
@Injectable()
export class AlarmsService {
  constructor(
    private readonly store: CellStateStore,
    private readonly repository: AcknowledgementRepository,
    @InjectPinoLogger(AlarmsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Reconoce una activación activa en el último estado conocido de la célula.
   * Si ya estaba reconocida, por quien fuera, devuelve ese reconocimiento.
   */
  async acknowledge(
    siteId: string,
    cellId: string,
    code: string,
    raisedAt: string,
    principal: Principal,
    ip: string | undefined,
    now = new Date(),
  ): Promise<{ created: boolean; acknowledgement: AlarmAcknowledgement }> {
    const cell = this.store
      .snapshot()
      .find((candidate) => candidate.siteId === siteId && candidate.cellId === cellId);
    if (cell === undefined) {
      throw new NotFoundException(`No hay datos de la célula ${siteId}/${cellId}`);
    }
    const raised = new Date(raisedAt);
    const active = cell.state?.activeAlarms.some(
      (alarm) => alarm.code === code && Date.parse(alarm.raisedAt) === raised.getTime(),
    );
    if (active !== true) {
      throw new ConflictException(
        `La alarma ${code} activada el ${raised.toISOString()} no está activa en ${siteId}/${cellId}`,
      );
    }

    const result = await this.repository.acknowledge({
      siteId,
      cellId,
      code,
      raisedAt: raised,
      acknowledgedAt: now,
      acknowledgedBy: principal.subject,
      acknowledgedByName: principal.name,
    });
    const acknowledgement = toAcknowledgement(result.acknowledgement);
    this.store.acknowledge(siteId, cellId, acknowledgement);
    if (result.created) {
      // Evento de auditoría en el log estructurado (ADR-0022).
      this.logger.info(
        {
          audit: true,
          event: 'alarm.acknowledged',
          siteId,
          cellId,
          code,
          raisedAt: raised.toISOString(),
          subject: principal.subject,
          user: principal.name,
          ip,
        },
        'Alarma reconocida',
      );
    }
    return { created: result.created, acknowledgement };
  }
}
