import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import { pushDevices, pushNotifiedAlarms } from '../database/schema.ts';
import type { AlarmActivation } from './alarm-activations.ts';

/** Dispositivos que reciben avisos y activaciones ya avisadas (ADR-0015). */
@Injectable()
export class PushRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Registra el token de un dispositivo, o lo pasa al usuario actual. */
  async registerDevice(token: string, userId: string, now: Date): Promise<void> {
    await this.db
      .insert(pushDevices)
      .values({ token, userId, registeredAt: now })
      .onConflictDoUpdate({ target: pushDevices.token, set: { userId, registeredAt: now } });
  }

  /** Quita un dispositivo del usuario, al cerrar sesión o desactivar los avisos. */
  async unregisterDevice(token: string, userId: string): Promise<void> {
    await this.db
      .delete(pushDevices)
      .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)));
  }

  /** Quita un token que FCM ya no reconoce. */
  async forgetDevice(token: string): Promise<void> {
    await this.db.delete(pushDevices).where(eq(pushDevices.token, token));
  }

  async deviceTokens(): Promise<string[]> {
    const rows = await this.db.select({ token: pushDevices.token }).from(pushDevices);
    return rows.map((row) => row.token);
  }

  /**
   * Anota la activación como avisada. Devuelve `false` si ya lo estaba: la
   * restricción única hace que solo una llamada pueda avisar.
   */
  async markNotified(activation: AlarmActivation, now: Date): Promise<boolean> {
    const inserted = await this.db
      .insert(pushNotifiedAlarms)
      .values({
        siteId: activation.siteId,
        cellId: activation.cellId,
        code: activation.code,
        raisedAt: new Date(activation.raisedAt),
        notifiedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: pushNotifiedAlarms.id });
    return inserted.length > 0;
  }
}
