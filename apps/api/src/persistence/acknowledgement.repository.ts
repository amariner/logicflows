import { Inject, Injectable } from '@nestjs/common';
import type { AlarmAcknowledgement } from '@logicflows/contract';
import { and, eq, or } from 'drizzle-orm';

import { DATABASE } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import { alarmAcknowledgements } from '../database/schema.ts';

/** Una activación de una alarma: la célula, el código y cuándo se activó (ADR-0015). */
export interface Activation {
  readonly siteId: string;
  readonly cellId: string;
  readonly code: string;
  readonly raisedAt: Date;
}

/** Un reconocimiento como se guarda: con el sujeto, para la auditoría. */
export interface StoredAcknowledgement extends Activation {
  readonly acknowledgedAt: Date;
  readonly acknowledgedBy: string;
  readonly acknowledgedByName: string;
}

/** El reconocimiento que ve el visor: sin el sujeto, solo el nombre (ADR-0022). */
export const toAcknowledgement = (stored: StoredAcknowledgement): AlarmAcknowledgement => ({
  code: stored.code,
  raisedAt: stored.raisedAt.toISOString(),
  acknowledgedBy: stored.acknowledgedByName,
  acknowledgedAt: stored.acknowledgedAt.toISOString(),
});

const sameActivation = (activation: Activation) =>
  and(
    eq(alarmAcknowledgements.siteId, activation.siteId),
    eq(alarmAcknowledgements.cellId, activation.cellId),
    eq(alarmAcknowledgements.code, activation.code),
    eq(alarmAcknowledgements.raisedAt, activation.raisedAt),
  );

/** Reconocimientos de alarmas (ADR-0022). */
@Injectable()
export class AcknowledgementRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Guarda el reconocimiento si la activación aún no tenía. Devuelve el que
   * queda guardado y si es este: la clave primaria decide quién llegó antes,
   * también entre réplicas.
   */
  async acknowledge(
    acknowledgement: StoredAcknowledgement,
  ): Promise<{ created: boolean; acknowledgement: StoredAcknowledgement }> {
    const inserted = await this.db
      .insert(alarmAcknowledgements)
      .values(acknowledgement)
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) {
      return { created: true, acknowledgement };
    }
    const [existing] = await this.forActivations([acknowledgement]);
    if (existing === undefined) {
      throw new Error('El reconocimiento existente no se encuentra');
    }
    return { created: false, acknowledgement: existing };
  }

  /** Los reconocimientos de esas activaciones, si los tienen. */
  async forActivations(activations: readonly Activation[]): Promise<StoredAcknowledgement[]> {
    if (activations.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(alarmAcknowledgements)
      .where(or(...activations.map(sameActivation)));
  }
}
