import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { Principal } from '../auth/roles.ts';
import { InvalidTicketError, RealtimeTickets, TICKET_TTL_MS } from './realtime-tickets.ts';

const tickets = (secret = 'secreto-de-tiques-de-al-menos-32-caracteres') =>
  new RealtimeTickets(new ConfigService({ REALTIME_TICKET_SECRET: secret }));

const NOW = Date.parse('2026-10-05T08:00:00.000Z');
const principal: Principal = { subject: 'operario', roles: ['viewer'], expiresAt: NOW + 300_000 };

describe('tiques del canal de tiempo real', () => {
  it('un tique devuelve quién lo pidió y cuándo caduca su token', async () => {
    const service = tickets();
    const { ticket, expiresAt } = await service.issue(principal, NOW);
    expect(expiresAt).toBe(new Date(NOW + TICKET_TTL_MS).toISOString());
    expect(await service.redeem(ticket, NOW + 1_000)).toEqual(principal);
  });

  it('solo se puede usar una vez', async () => {
    const service = tickets();
    const { ticket } = await service.issue(principal, NOW);
    await service.redeem(ticket, NOW);
    await expect(service.redeem(ticket, NOW)).rejects.toThrow(InvalidTicketError);
  });

  it('caduca a los 30 segundos', async () => {
    const service = tickets();
    const { ticket } = await service.issue(principal, NOW);
    await expect(service.redeem(ticket, NOW + TICKET_TTL_MS + 1_000)).rejects.toThrow(
      InvalidTicketError,
    );
  });

  it('otra instancia con el mismo secreto lo acepta; con otro secreto, no', async () => {
    const { ticket } = await tickets().issue(principal, NOW);
    expect(await tickets().redeem(ticket, NOW)).toEqual(principal);
    await expect(
      tickets('otro-secreto-de-tiques-de-al-menos-32-caracteres').redeem(ticket, NOW),
    ).rejects.toThrow(InvalidTicketError);
  });

  it('rechaza un texto que no es un tique', async () => {
    await expect(tickets().redeem('no-es-un-tique', NOW)).rejects.toThrow(InvalidTicketError);
  });
});
