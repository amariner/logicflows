import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { REALTIME_TICKETS_PATH, REALTIME_UNAUTHORIZED_CLOSE_CODE } from '@logicflows/contract';
import type { CellSnapshot, RealtimeMessage } from '@logicflows/contract';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth';
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
 * Tras más tiempo en segundo plano, una conexión que parece abierta puede
 * estar muerta sin saberlo: Android congela la vista web de la app y la red
 * del móvil cambia mientras tanto (LF-70).
 */
export const STALE_AFTER_HIDDEN_MS = 30_000;

/**
 * Información de las células en tiempo real. Al arrancar la carga por REST y
 * abre el canal de tiempo real (ADR-0006), que aporta una instantánea y cada
 * cambio; reconecta con espera creciente si se pierde la conexión. Las dos
 * fuentes pueden llegar en cualquier orden: para cada mensaje se conserva
 * siempre el más reciente, así que nunca se muestra un dato antiguo.
 *
 * Con inicio de sesión, cada conexión usa un tique de un solo uso pedido a la
 * API (ADR-0009). Si la API cierra la conexión porque caducó la sesión, se
 * pide un tique nuevo y se reconecta enseguida.
 *
 * Al volver a primer plano (la pestaña o la app Android), si la conexión no
 * está abierta o se pasó demasiado tiempo en segundo plano, se recarga el
 * estado y se reconecta sin esperar: nunca se muestra como actual un dato de
 * antes de pasar a segundo plano.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  readonly #config = inject(AppConfigService);
  readonly #auth = inject(AuthService);
  readonly #http = inject(HttpClient);
  readonly #createSocket = inject(WEB_SOCKET_FACTORY);
  readonly #cells = signal<ReadonlyMap<string, CellSnapshot>>(new Map());
  readonly #connection = signal<ConnectionState>('closed');
  #socket: WebSocket | undefined;
  #attempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #stopped = true;
  /** Cambia en cada reconexión forzada: invalida los tiques pedidos antes. */
  #generation = 0;
  #hiddenAt: number | undefined;

  /** Estado de la conexión con la API. */
  readonly connection = this.#connection.asReadonly();

  /** Información de las células, ordenadas por planta y célula. */
  readonly cells = computed(() =>
    [...this.#cells().values()].sort(
      (a, b) => a.siteId.localeCompare(b.siteId) || a.cellId.localeCompare(b.cellId),
    ),
  );

  constructor() {
    const onVisibilityChange = () => {
      this.#onVisibilityChange();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
    this.#generation++;
    clearTimeout(this.#reconnectTimer);
    this.#socket?.close();
    this.#socket = undefined;
    this.#connection.set('closed');
  }

  #onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      this.#hiddenAt = Date.now();
      return;
    }
    const hiddenFor = this.#hiddenAt === undefined ? 0 : Date.now() - this.#hiddenAt;
    this.#hiddenAt = undefined;
    if (this.#stopped) {
      return;
    }
    const healthy = this.#connection() !== 'closed' && hiddenFor < STALE_AFTER_HIDDEN_MS;
    if (!healthy) {
      this.#reconnectNow();
    }
  }

  /** Descarta la conexión actual, recarga el estado y reconecta sin esperar. */
  #reconnectNow(): void {
    clearTimeout(this.#reconnectTimer);
    const previous = this.#socket;
    // Primero se olvida: su cierre ya no debe programar otra reconexión.
    this.#socket = undefined;
    previous?.close();
    this.#generation++;
    this.#attempt = 0;
    this.#loadInitialState();
    this.#connect();
  }

  #connect(): void {
    this.#connection.set('connecting');
    if (!this.#auth.enabled) {
      this.#open(this.#config.config.realtimeUrl);
      return;
    }
    const generation = this.#generation;
    const current = () => !this.#stopped && generation === this.#generation;
    this.#ticketUrl().then(
      (url) => {
        if (current()) {
          this.#open(url);
        }
      },
      () => {
        if (current()) {
          this.#scheduleReconnect();
        }
      },
    );
  }

  async #ticketUrl(): Promise<string> {
    const { ticket } = await firstValueFrom(
      this.#http.post<{ ticket: string }>(
        `${this.#config.config.apiUrl}/api/v1${REALTIME_TICKETS_PATH}`,
        null,
      ),
    );
    return `${this.#config.config.realtimeUrl}?ticket=${encodeURIComponent(ticket)}`;
  }

  #open(url: string): void {
    const socket = this.#createSocket(url);
    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#attempt = 0;
      this.#connection.set('open');
    });
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      this.#apply(JSON.parse(event.data) as RealtimeMessage);
    });
    socket.addEventListener('close', (event: Event) => {
      if (this.#socket !== socket || this.#stopped) {
        return;
      }
      if ((event as Partial<CloseEvent>).code === REALTIME_UNAUTHORIZED_CLOSE_CODE) {
        // Sesión caducada o tique rechazado: basta con pedir otro.
        this.#attempt = 0;
      }
      this.#scheduleReconnect();
    });
  }

  #scheduleReconnect(): void {
    if (this.#stopped) {
      return;
    }
    this.#connection.set('closed');
    this.#reconnectTimer = setTimeout(() => {
      this.#connect();
    }, reconnectDelay(this.#attempt++));
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
