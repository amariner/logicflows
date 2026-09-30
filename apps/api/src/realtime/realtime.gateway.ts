import type { OnModuleDestroy } from '@nestjs/common';
import { REALTIME_PATH } from '@logicflows/contract';
import type { RealtimeMessage } from '@logicflows/contract';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayInit } from '@nestjs/websockets';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Subscription } from 'rxjs';
import { WebSocket } from 'ws';
import type { Server } from 'ws';

import { CellStateStore } from './cell-state.store.ts';

/** Intervalo del ping que detecta las conexiones muertas (ADR-0006). */
export const HEARTBEAT_MS = 30_000;

/**
 * Canal de tiempo real hacia el visor (ADR-0006): envía la información de
 * todas las células al conectar y la de cada célula que cambia a todos los
 * clientes.
 */
@WebSocketGateway({ path: REALTIME_PATH })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() private readonly server!: Server;
  readonly #alive = new WeakSet<WebSocket>();
  #updates: Subscription | undefined;
  #heartbeat: NodeJS.Timeout | undefined;

  constructor(
    private readonly store: CellStateStore,
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

  handleConnection(client: WebSocket): void {
    this.#alive.add(client);
    client.on('pong', () => this.#alive.add(client));
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
      if (client.readyState === WebSocket.OPEN) {
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
