import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { CellSnapshot, DecodedMessage } from '@logicflows/contract';
import { Subject } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';

import { TelemetryStream } from '../ingestion/telemetry-stream.ts';

const emptySnapshot = (siteId: string, cellId: string): CellSnapshot => ({
  siteId,
  cellId,
  status: null,
  state: null,
  telemetry: null,
});

/**
 * Última información conocida de cada célula, construida a partir de los
 * mensajes aceptados por la ingesta. Tras reiniciar la API se reconstruye con
 * los mensajes retenidos del broker.
 */
@Injectable()
export class CellStateStore implements OnModuleInit, OnModuleDestroy {
  readonly #cells = new Map<string, CellSnapshot>();
  readonly #updates = new Subject<CellSnapshot>();
  #subscription: Subscription | undefined;

  constructor(private readonly stream: TelemetryStream) {}

  /** Emite la información de una célula cada vez que cambia. */
  get updates$(): Observable<CellSnapshot> {
    return this.#updates.asObservable();
  }

  onModuleInit(): void {
    this.#subscription = this.stream.messages$.subscribe(({ decoded }) => {
      this.apply(decoded);
    });
  }

  onModuleDestroy(): void {
    this.#subscription?.unsubscribe();
    this.#updates.complete();
  }

  apply(decoded: DecodedMessage): CellSnapshot {
    const { siteId, cellId } = decoded.address;
    const key = `${siteId}/${cellId}`;
    const current = this.#cells.get(key) ?? emptySnapshot(siteId, cellId);
    let next: CellSnapshot;
    switch (decoded.kind) {
      case 'status':
        next = { ...current, status: decoded.message };
        break;
      case 'state':
        next = { ...current, state: decoded.message };
        break;
      case 'telemetry':
        next = { ...current, telemetry: decoded.message };
        break;
    }
    this.#cells.set(key, next);
    this.#updates.next(next);
    return next;
  }

  /** Información de todas las células, ordenadas por planta y célula. */
  snapshot(): CellSnapshot[] {
    return [...this.#cells.values()].sort(
      (a, b) => a.siteId.localeCompare(b.siteId) || a.cellId.localeCompare(b.cellId),
    );
  }
}
