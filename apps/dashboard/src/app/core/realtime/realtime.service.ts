import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import type { CellSnapshot, RealtimeMessage } from '@logicflows/contract';

import { AppConfigService } from '../config/app-config';
import { mergeCell } from './merge';
import { reconnectDelay } from './reconnect';

export type ConnectionState = 'connecting' | 'open' | 'closed';

/** Crea el WebSocket. Se sustituye en las pruebas. */
export const WEB_SOCKET_FACTORY = new InjectionToken<(url: string) => WebSocket>(
  'WEB_SOCKET_FACTORY',
  { providedIn: 'root', factory: () => (url: string) => new WebSocket(url) },
);

const keyOf = (cell: CellSnapshot) => `${cell.siteId}/${cell.cellId}`;

/**
 * Información de las células en tiempo real. Al arrancar la carga por REST y
 * abre el canal de tiempo real (ADR-0006), que aporta una instantánea y cada
 * cambio; reconecta con espera creciente si se pierde la conexión. Las dos
 * fuentes pueden llegar en cualquier orden: para cada mensaje se conserva
 * siempre el más reciente, así que nunca se muestra un dato antiguo.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  readonly #config = inject(AppConfigService);
  readonly #http = inject(HttpClient);
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
    this.#loadInitialState();
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

  /** Estado inicial por REST, sin esperar al canal de tiempo real. */
  #loadInitialState(): void {
    this.#http.get<CellSnapshot[]>(`${this.#config.config.apiUrl}/api/v1/cells`).subscribe({
      next: (cells) => {
        this.#merge(cells);
      },
      // Si falla, el canal de tiempo real aporta la misma información.
      error: () => undefined,
    });
  }

  #apply(message: RealtimeMessage): void {
    this.#merge(message.type === 'snapshot' ? message.cells : [message.cell]);
  }

  #merge(incoming: readonly CellSnapshot[]): void {
    if (this.#stopped) {
      return;
    }
    this.#cells.update((cells) => {
      const next = new Map(cells);
      for (const cell of incoming) {
        next.set(keyOf(cell), mergeCell(next.get(keyOf(cell)), cell));
      }
      return next;
    });
  }
}
