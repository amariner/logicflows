import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Principal } from '../auth/roles.ts';
import { localDate, previousDay, ShiftCalendar } from './calendar.ts';
import type { Shift } from './calendar.ts';
import { CalendarRepository } from './calendar.repository.ts';
import type { StoredException, StoredVersion } from './calendar.repository.ts';
import type { ExceptionBody, VersionBody } from './calendar.schemas.ts';

/** Días de excepciones pasadas que se devuelven, para explicar el último mes. */
const PAST_EXCEPTION_DAYS = 31;

export interface VersionView {
  readonly effectiveFrom: string;
  readonly timeZone: string;
  readonly shifts: readonly Shift[];
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ExceptionView {
  readonly date: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CalendarView {
  readonly siteId: string;
  /** Fecha local de hoy en la planta, según la última versión (o UTC). */
  readonly today: string;
  /** Entrada en vigor de la versión vigente hoy; null si aún no hay. */
  readonly current: string | null;
  /** La versión vigente y las futuras, de la más antigua a la más reciente. */
  readonly versions: readonly VersionView[];
  /** Las excepciones del último mes y las futuras. */
  readonly exceptions: readonly ExceptionView[];
}

// Solo el nombre de usuario sale de la API: el sujeto queda para la auditoría.
const toVersionView = (version: StoredVersion): VersionView => ({
  effectiveFrom: version.effectiveFrom,
  timeZone: version.timeZone,
  shifts: version.shifts,
  createdBy: version.createdByName,
  createdAt: version.createdAt.toISOString(),
});

const toExceptionView = (exception: StoredException): ExceptionView => ({
  date: exception.date,
  name: exception.name,
  createdBy: exception.createdByName,
  createdAt: exception.createdAt.toISOString(),
});

/**
 * Calendario de turnos de cada planta (ADR-0021). El pasado no se reescribe:
 * las versiones y excepciones solo se crean, cambian o borran a partir de
 * mañana, en la hora local de la planta.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly repository: CalendarRepository,
    @InjectPinoLogger(CalendarService.name) private readonly logger: PinoLogger,
  ) {}

  /** El calendario completo, para calcular los indicadores (LF-125). */
  async calendar(siteId: string): Promise<ShiftCalendar> {
    const [versions, exceptions] = await Promise.all([
      this.repository.versions(siteId),
      this.repository.exceptions(siteId),
    ]);
    return new ShiftCalendar(versions, exceptions);
  }

  async view(siteId: string, now = new Date()): Promise<CalendarView> {
    const [versions, exceptions] = await Promise.all([
      this.repository.versions(siteId),
      this.repository.exceptions(siteId),
    ]);
    const today = localDate(now, versions.at(-1)?.timeZone ?? 'UTC');
    const current = new ShiftCalendar(versions, []).versionOn(today)?.effectiveFrom ?? null;
    let oldestException = today;
    for (let day = 0; day < PAST_EXCEPTION_DAYS; day++) {
      oldestException = previousDay(oldestException);
    }
    return {
      siteId,
      today,
      current,
      versions: versions
        .filter((version) => version.effectiveFrom >= (current ?? today))
        .map(toVersionView),
      exceptions: exceptions
        .filter((exception) => exception.date >= oldestException)
        .map(toExceptionView),
    };
  }

  /** Crea o sustituye una versión futura. Devuelve si la creó. */
  async saveVersion(
    siteId: string,
    effectiveFrom: string,
    body: VersionBody,
    principal: Principal,
    now = new Date(),
  ): Promise<{ created: boolean; version: VersionView }> {
    this.#requireFuture(effectiveFrom, localDate(now, body.timeZone), 'La versión');
    const before = (await this.repository.versions(siteId)).find(
      (version) => version.effectiveFrom === effectiveFrom,
    );
    const version: StoredVersion = {
      effectiveFrom,
      timeZone: body.timeZone,
      shifts: body.shifts,
      createdBy: principal.subject,
      createdByName: principal.name,
      createdAt: now,
    };
    await this.repository.saveVersion(siteId, version);
    this.#audit(principal, 'calendar.version.saved', 'Versión del calendario guardada', {
      siteId,
      effectiveFrom,
      before: before === undefined ? null : { timeZone: before.timeZone, shifts: before.shifts },
      after: { timeZone: version.timeZone, shifts: version.shifts },
    });
    return { created: before === undefined, version: toVersionView(version) };
  }

  async deleteVersion(
    siteId: string,
    effectiveFrom: string,
    principal: Principal,
    now = new Date(),
  ): Promise<void> {
    const version = (await this.repository.versions(siteId)).find(
      (candidate) => candidate.effectiveFrom === effectiveFrom,
    );
    if (version === undefined) {
      throw new NotFoundException(`No hay una versión del calendario del ${effectiveFrom}`);
    }
    this.#requireFuture(effectiveFrom, localDate(now, version.timeZone), 'La versión');
    await this.repository.deleteVersion(siteId, effectiveFrom);
    this.#audit(principal, 'calendar.version.deleted', 'Versión del calendario borrada', {
      siteId,
      effectiveFrom,
      before: { timeZone: version.timeZone, shifts: version.shifts },
    });
  }

  /** Crea o sustituye la excepción de un día futuro con calendario. */
  async saveException(
    siteId: string,
    date: string,
    body: ExceptionBody,
    principal: Principal,
    now = new Date(),
  ): Promise<{ created: boolean; exception: ExceptionView }> {
    const calendar = await this.calendar(siteId);
    const version = calendar.versionOn(date);
    if (version === undefined) {
      throw new ConflictException(`La planta no tiene calendario vigente el ${date}`);
    }
    this.#requireFuture(date, localDate(now, version.timeZone), 'La excepción');
    const before = (await this.repository.exceptions(siteId)).find(
      (exception) => exception.date === date,
    );
    const exception: StoredException = {
      date,
      name: body.name,
      createdBy: principal.subject,
      createdByName: principal.name,
      createdAt: now,
    };
    await this.repository.saveException(siteId, exception);
    this.#audit(principal, 'calendar.exception.saved', 'Excepción del calendario guardada', {
      siteId,
      date,
      before: before === undefined ? null : { name: before.name },
      after: { name: exception.name },
    });
    return { created: before === undefined, exception: toExceptionView(exception) };
  }

  async deleteException(
    siteId: string,
    date: string,
    principal: Principal,
    now = new Date(),
  ): Promise<void> {
    const [exceptions, calendar] = await Promise.all([
      this.repository.exceptions(siteId),
      this.calendar(siteId),
    ]);
    const exception = exceptions.find((candidate) => candidate.date === date);
    if (exception === undefined) {
      throw new NotFoundException(`No hay una excepción del calendario el ${date}`);
    }
    const timeZone = calendar.versionOn(date)?.timeZone ?? 'UTC';
    this.#requireFuture(date, localDate(now, timeZone), 'La excepción');
    await this.repository.deleteException(siteId, date);
    this.#audit(principal, 'calendar.exception.deleted', 'Excepción del calendario borrada', {
      siteId,
      date,
      before: { name: exception.name },
    });
  }

  /** El pasado y hoy no se tocan: los indicadores ya enseñados no cambian. */
  #requireFuture(date: string, today: string, what: string): void {
    if (date <= today) {
      throw new ConflictException(
        `${what} debe ser como pronto de mañana (hoy es ${today} en la planta): el pasado no se reescribe`,
      );
    }
  }

  /** Evento de auditoría en el log estructurado (ADR-0022). */
  #audit(principal: Principal, event: string, message: string, details: object): void {
    this.logger.info(
      { audit: true, event, subject: principal.subject, user: principal.name, ...details },
      message,
    );
  }
}
