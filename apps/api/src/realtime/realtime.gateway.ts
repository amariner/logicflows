import type { IncomingMessage } from 'node:http';

import type { OnModuleDestroy } from '@nestjs/common';
import { REALTIME_PATH, REALTIME_UNAUTHORIZED_CLOSE_CODE } from '@logicflows/contract';
import type { RealtimeMessage } from '@logicflows/contract';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayInit } from '@nestjs/websockets';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Subscription } from 'rxjs';
import { WebSocket } from 'ws';
import type { Server } from 'ws';

import { CellStateStore } from './cell-state.store.ts';
import { RealtimeTickets } from './realtime-tickets.ts';

/** Intervalo del ping que detecta las conexiones muertas (ADR-0006). */
export const HEARTBEAT_MS = 30_000;

/** Máximo admitido por `setTimeout`, unos 24 días. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Canal de tiempo real hacia el visor (ADR-0006): envía la información de
 * todas las células al conectar y la de cada célula que cambia a todos los
 * clientes autorizados. Cada conexión presenta un tique de un solo uso y se
 * cierra cuando caduca el token con el que se obtuvo (ADR-0009).
 */
// El visor no envía mensajes: se rechaza cualquiera de más de 1 KB (LF-52).
@WebSocketGateway({ path: REALTIME_PATH, maxPayload: 1024 })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() private readonly server!: Server;
  readonly #alive = new WeakSet<WebSocket>();
  readonly #authorized = new WeakSet<WebSocket>();
  #updates: Subscription | undefined;
  #heartbeat: NodeJS.Timeout | undefined;

  constructor(
    private readonly store: CellStateStore,
    private readonly tickets: RealtimeTickets,
    @InjectPinoLogger(RealtimeGateway.name) private readonly logger: PinoLogger,
  ) {}

  afterInit(): void {
    this.#updates = this.store.updates$.subscribe((cell) => {
      this.#broadcast({ type: 'cell', cell });
    });
    this.#heartbeat = setInterval(() => {
      this.#checkConnections();
    }, HEARTBEAT_MS);
  }

  async handleConnection(client: WebSocket, request: IncomingMessage): Promise<void> {
    this.#alive.add(client);
    client.on('pong', () => this.#alive.add(client));

    const ticket = new URL(request.url ?? '', 'http://localhost').searchParams.get('ticket');
    let expiresAt: number;
    try {
      if (ticket === null) {
        throw new Error('Falta el tique');
      }
      ({ expiresAt } = await this.tickets.redeem(ticket));
    } catch (error) {
      this.logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Conexión de tiempo real rechazada',
      );
      client.close(REALTIME_UNAUTHORIZED_CLOSE_CODE, 'No autorizado');
      return;
    }
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    const expiry = setTimeout(
      () => {
        client.close(REALTIME_UNAUTHORIZED_CLOSE_CODE, 'Sesión caducada');
      },
      Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMEOUT_MS),
    );
    client.once('close', () => {
      clearTimeout(expiry);
    });
    this.#authorized.add(client);
    this.#send(client, { type: 'snapshot', cells: this.store.snapshot() });
    this.logger.debug({ clients: this.server.clients.size }, 'Cliente de tiempo real conectado');
  }

  onModuleDestroy(): void {
    clearInterval(this.#heartbeat);
    this.#updates?.unsubscribe();
  }

  #broadcast(message: RealtimeMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.server.clients) {
      if (client.readyState === WebSocket.OPEN && this.#authorized.has(client)) {
        client.send(payload);
      }
    }
  }

  #send(client: WebSocket, message: RealtimeMessage): void {
    client.send(JSON.stringify(message));
  }

  /** Cierra las conexiones que no respondieron al ping anterior. */
  #checkConnections(): void {
    for (const client of this.server.clients) {
      if (!this.#alive.has(client)) {
        client.terminate();
        continue;
      }
      this.#alive.delete(client);
      client.ping();
    }
  }
}
