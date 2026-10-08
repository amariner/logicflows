import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { DATABASE } from '../database/database.module.ts';
import type { Database } from '../database/database.module.ts';
import {
  shiftCalendarExceptions,
  shiftCalendarShifts,
  shiftCalendarVersions,
} from '../database/schema.ts';
import type { CalendarException, CalendarVersion, Weekday } from './calendar.ts';

/** Quién creó una versión o una excepción y cuándo. */
export interface Authorship {
  readonly createdBy: string;
  readonly createdByName: string;
  readonly createdAt: Date;
}

export type StoredVersion = CalendarVersion & Authorship;
export type StoredException = CalendarException & Authorship;

/** Acceso al calendario de turnos de cada planta (ADR-0021). */
@Injectable()
export class CalendarRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Todas las versiones de una planta, de la más antigua a la más reciente. */
  async versions(siteId: string): Promise<StoredVersion[]> {
    const [versions, shifts] = await Promise.all([
      this.db
        .select()
        .from(shiftCalendarVersions)
        .where(eq(shiftCalendarVersions.siteId, siteId))
        .orderBy(asc(shiftCalendarVersions.effectiveFrom)),
      this.db
        .select()
        .from(shiftCalendarShifts)
        .where(eq(shiftCalendarShifts.siteId, siteId))
        .orderBy(asc(shiftCalendarShifts.weekday), asc(shiftCalendarShifts.startHour)),
    ]);
    return versions.map((version) => ({
      effectiveFrom: version.effectiveFrom,
      timeZone: version.timeZone,
      createdBy: version.createdBy,
      createdByName: version.createdByName,
      createdAt: version.createdAt,
      shifts: shifts
        .filter((shift) => shift.effectiveFrom === version.effectiveFrom)
        .map((shift) => ({
          weekday: shift.weekday as Weekday,
          start: shift.startHour,
          end: shift.endHour,
          name: shift.name,
        })),
    }));
  }

  /** Todas las excepciones de una planta, por fecha. */
  async exceptions(siteId: string): Promise<StoredException[]> {
    const rows = await this.db
      .select()
      .from(shiftCalendarExceptions)
      .where(eq(shiftCalendarExceptions.siteId, siteId))
      .orderBy(asc(shiftCalendarExceptions.date));
    return rows.map(({ siteId: _site, ...exception }) => exception);
  }

  /** Crea o sustituye una versión con sus turnos, de una vez. */
  async saveVersion(siteId: string, version: StoredVersion): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(shiftCalendarVersions)
        .where(
          and(
            eq(shiftCalendarVersions.siteId, siteId),
            eq(shiftCalendarVersions.effectiveFrom, version.effectiveFrom),
          ),
        );
      await tx.insert(shiftCalendarVersions).values({
        siteId,
        effectiveFrom: version.effectiveFrom,
        timeZone: version.timeZone,
        createdBy: version.createdBy,
        createdByName: version.createdByName,
        createdAt: version.createdAt,
      });
      if (version.shifts.length > 0) {
        await tx.insert(shiftCalendarShifts).values(
          version.shifts.map((shift) => ({
            siteId,
            effectiveFrom: version.effectiveFrom,
            weekday: shift.weekday,
            startHour: shift.start,
            endHour: shift.end,
            name: shift.name,
          })),
        );
      }
    });
  }

  /** Borra una versión y sus turnos (en cascada). */
  async deleteVersion(siteId: string, effectiveFrom: string): Promise<void> {
    await this.db
      .delete(shiftCalendarVersions)
      .where(
        and(
          eq(shiftCalendarVersions.siteId, siteId),
          eq(shiftCalendarVersions.effectiveFrom, effectiveFrom),
        ),
      );
  }

  /** Crea o sustituye la excepción de un día. */
  async saveException(siteId: string, exception: StoredException): Promise<void> {
    await this.db
      .insert(shiftCalendarExceptions)
      .values({ siteId, ...exception })
      .onConflictDoUpdate({
        target: [shiftCalendarExceptions.siteId, shiftCalendarExceptions.date],
        set: {
          name: exception.name,
          createdBy: exception.createdBy,
          createdByName: exception.createdByName,
          createdAt: exception.createdAt,
        },
      });
  }

  async deleteException(siteId: string, date: string): Promise<void> {
    await this.db
      .delete(shiftCalendarExceptions)
      .where(
        and(eq(shiftCalendarExceptions.siteId, siteId), eq(shiftCalendarExceptions.date, date)),
      );
  }
}
