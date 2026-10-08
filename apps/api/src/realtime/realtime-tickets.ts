import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

import type { Principal, Role } from '../auth/roles.ts';
import type { AppConfig } from '../config/config.ts';

/** Vida de un tique: el visor lo usa nada más pedirlo (ADR-0009). */
export const TICKET_TTL_MS = 30_000;
const AUDIENCE = 'logicflows-realtime';

export interface IssuedTicket {
  readonly ticket: string;
  readonly expiresAt: string;
}

/** El tique no es válido, ha caducado o ya se usó. */
export class InvalidTicketError extends Error {}

/**
 * Tiques de un solo uso para abrir el canal de tiempo real (ADR-0009). El
 * navegador no puede enviar cabeceras al abrir un WebSocket y el token de
 * acceso no debe aparecer en una URL: el visor pide un tique con su token y
 * lo usa al conectar.
 *
 * Los tiques van firmados con un secreto compartido por todas las instancias,
 * así que cualquiera puede validarlos. Cada instancia recuerda los que ya se
 * usaron en ella mientras no caducan.
 */
@Injectable()
export class RealtimeTickets {
  readonly #secret: Uint8Array;
  readonly #used = new Map<string, number>();

  constructor(config: ConfigService<AppConfig, true>) {
    this.#secret = new TextEncoder().encode(config.get('REALTIME_TICKET_SECRET', { infer: true }));
  }

  async issue(principal: Principal, now = Date.now()): Promise<IssuedTicket> {
    const expiresAt = now + TICKET_TTL_MS;
    const ticket = await new SignJWT({
      roles: principal.roles,
      name: principal.name,
      tokenExp: principal.expiresAt,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(principal.subject)
      .setAudience(AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt(Math.floor(now / 1000))
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(this.#secret);
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  async redeem(ticket: string, now = Date.now()): Promise<Principal> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(ticket, this.#secret, {
        audience: AUDIENCE,
        algorithms: ['HS256'],
        currentDate: new Date(now),
      }));
    } catch (error) {
      throw new InvalidTicketError(error instanceof Error ? error.message : String(error));
    }
    this.#forgetExpired(now);
    const { jti, sub, exp, roles, name, tokenExp } = payload;
    if (jti === undefined || sub === undefined || exp === undefined) {
      throw new InvalidTicketError('Tique incompleto');
    }
    if (this.#used.has(jti)) {
      throw new InvalidTicketError('El tique ya se usó');
    }
    this.#used.set(jti, exp * 1000);
    return {
      subject: sub,
      name: typeof name === 'string' ? name : sub,
      roles: Array.isArray(roles) ? (roles as Role[]) : [],
      expiresAt: typeof tokenExp === 'number' ? tokenExp : now,
    };
  }

  #forgetExpired(now: number): void {
    for (const [jti, expiresAt] of this.#used) {
      if (expiresAt <= now) {
        this.#used.delete(jti);
      }
    }
  }
}
