import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import type { CellSnapshot, RealtimeMessage } from '@logicflows/contract';

import { AppConfigService } from '../config/app-config';
import { reconnectDelay } from './reconnect';

export type ConnectionState = 'connecting' | 'open' | 'closed';

/** Crea el WebSocket. Se sustituye en las pruebas. */
export const WEB_SOCKET_FACTORY = new InjectionToken<(url: string) => WebSocket>(
  'WEB_SOCKET_FACTORY',
  { providedIn: 'root', factory: () => (url: string) => new WebSocket(url) },
);

const keyOf = (cell: CellSnapshot) => `${cell.siteId}/${cell.cellId}`;

/**
 * Canal de tiempo real con la API (ADR-0006). Mantiene la información de las
 * células a partir de la instantánea inicial y de cada cambio, y reconecta
 * con espera creciente si se pierde la conexión.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  readonly #config = inject(AppConfigService);
  readonly #createSocket = inject(WEB_SOCKET_FACTORY);
  readonly #cells = signal<ReadonlyMap<string, CellSnapshot>>(new Map());
  readonly #connection = signal<ConnectionState>('closed');
  #socket: WebSocket | undefined;
  #attempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #stopped = true;

  /** Estado de la conexión con la API. */
  readonly connection = this.#connection.asReadonly();

  /** Información de las células, ordenadas por planta y célula. */
  readonly cells = computed(() =>
    [...this.#cells().values()].sort(
      (a, b) => a.siteId.localeCompare(b.siteId) || a.cellId.localeCompare(b.cellId),
    ),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
    });
  }

  /** Abre la conexión. Llamarlo de nuevo no tiene efecto. */
  start(): void {
    if (!this.#stopped) {
      return;
    }
    this.#stopped = false;
    this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#reconnectTimer);
    this.#socket?.close();
    this.#socket = undefined;
    this.#connection.set('closed');
  }

  #connect(): void {
    this.#connection.set('connecting');
    const socket = this.#createSocket(this.#config.config.realtimeUrl);
    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#attempt = 0;
      this.#connection.set('open');
    });
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      this.#apply(JSON.parse(event.data) as RealtimeMessage);
    });
    socket.addEventListener('close', () => {
      if (this.#socket !== socket || this.#stopped) {
        return;
      }
      this.#connection.set('closed');
      this.#reconnectTimer = setTimeout(() => {
        this.#connect();
      }, reconnectDelay(this.#attempt++));
    });
  }

  #apply(message: RealtimeMessage): void {
    if (message.type === 'snapshot') {
      this.#cells.set(new Map(message.cells.map((cell) => [keyOf(cell), cell])));
      return;
    }
    this.#cells.update((cells) => new Map(cells).set(keyOf(message.cell), message.cell));
  }
}
