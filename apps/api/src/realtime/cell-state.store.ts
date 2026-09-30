import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { CellSnapshot, DecodedMessage } from '@logicflows/contract';
import { Subject } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';

import { TelemetryStream } from '../ingestion/telemetry-stream.ts';
import { TelemetryRepository } from '../persistence/telemetry.repository.ts';

const emptySnapshot = (siteId: string, cellId: string): CellSnapshot => ({
  siteId,
  cellId,
  status: null,
  state: null,
  telemetry: null,
});

/**
 * Última información conocida de cada célula, construida a partir de los
 * mensajes aceptados por la ingesta. Al arrancar se recupera de la base de
 * datos, así que no depende de que el broker conserve los retenidos.
 */
@Injectable()
export class CellStateStore implements OnModuleInit, OnModuleDestroy {
  readonly #cells = new Map<string, CellSnapshot>();
  readonly #updates = new Subject<CellSnapshot>();
  #subscription: Subscription | undefined;

  constructor(
    private readonly stream: TelemetryStream,
    private readonly repository: TelemetryRepository,
  ) {}

  /** Emite la información de una célula cada vez que cambia. */
  get updates$(): Observable<CellSnapshot> {
    return this.#updates.asObservable();
  }

  async onModuleInit(): Promise<void> {
    // Primero se escucha la ingesta y después se recupera la base de datos:
    // lo que llegue mientras tanto es más reciente y no se sobrescribe.
    this.#subscription = this.stream.messages$.subscribe(({ decoded }) => {
      this.apply(decoded);
    });
    this.seed(await this.repository.latestSnapshots());
  }

  /** Añade la información guardada de las células que aún no se conocen. */
  seed(snapshots: readonly CellSnapshot[]): void {
    for (const snapshot of snapshots) {
      const key = `${snapshot.siteId}/${snapshot.cellId}`;
      if (!this.#cells.has(key)) {
        this.#cells.set(key, snapshot);
      }
    }
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
