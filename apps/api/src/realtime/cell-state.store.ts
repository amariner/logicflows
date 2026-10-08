import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { AlarmAcknowledgement, CellSnapshot, DecodedMessage } from '@logicflows/contract';
import { Subject } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';

import { TelemetryStream } from '../ingestion/telemetry-stream.ts';
import {
  AcknowledgementRepository,
  toAcknowledgement,
} from '../persistence/acknowledgement.repository.ts';
import { TelemetryRepository } from '../persistence/telemetry.repository.ts';

const activationKey = (code: string, raisedAt: string) => `${code}@${Date.parse(raisedAt)}`;

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
  /** Reconocimientos de las alarmas activas de cada célula (ADR-0022). */
  readonly #acknowledgements = new Map<string, Map<string, AlarmAcknowledgement>>();
  readonly #updates = new Subject<CellSnapshot>();
  #subscription: Subscription | undefined;

  constructor(
    private readonly stream: TelemetryStream,
    private readonly repository: TelemetryRepository,
    private readonly acknowledgements: AcknowledgementRepository,
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
    // Los reconocimientos de las alarmas que siguen activas.
    const activations = [...this.#cells.values()].flatMap((cell) =>
      (cell.state?.activeAlarms ?? []).map((alarm) => ({
        siteId: cell.siteId,
        cellId: cell.cellId,
        code: alarm.code,
        raisedAt: new Date(alarm.raisedAt),
      })),
    );
    for (const stored of await this.acknowledgements.forActivations(activations)) {
      this.#remember(stored.siteId, stored.cellId, toAcknowledgement(stored));
    }
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
        this.#forgetResolved(key, next);
        break;
      case 'telemetry':
        next = { ...current, telemetry: decoded.message };
        break;
    }
    this.#cells.set(key, next);
    const view = this.#withAcknowledgements(key, next);
    this.#updates.next(view);
    return view;
  }

  /** Información de todas las células, ordenadas por planta y célula. */
  snapshot(): CellSnapshot[] {
    return [...this.#cells.entries()]
      .map(([key, cell]) => this.#withAcknowledgements(key, cell))
      .sort((a, b) => a.siteId.localeCompare(b.siteId) || a.cellId.localeCompare(b.cellId));
  }

  /**
   * Añade el reconocimiento de una alarma y emite la célula actualizada a los
   * visores (ADR-0022). Volver a añadir el mismo no cambia nada.
   */
  acknowledge(siteId: string, cellId: string, acknowledgement: AlarmAcknowledgement): void {
    const key = `${siteId}/${cellId}`;
    const cell = this.#cells.get(key);
    if (cell === undefined || !this.#remember(siteId, cellId, acknowledgement)) {
      return;
    }
    this.#updates.next(this.#withAcknowledgements(key, cell));
  }

  #remember(siteId: string, cellId: string, acknowledgement: AlarmAcknowledgement): boolean {
    const key = `${siteId}/${cellId}`;
    const byActivation = this.#acknowledgements.get(key) ?? new Map<string, AlarmAcknowledgement>();
    const activation = activationKey(acknowledgement.code, acknowledgement.raisedAt);
    if (byActivation.has(activation)) {
      return false;
    }
    byActivation.set(activation, acknowledgement);
    this.#acknowledgements.set(key, byActivation);
    return true;
  }

  /** Una alarma resuelta deja de estar en pantalla, y su reconocimiento también. */
  #forgetResolved(key: string, cell: CellSnapshot): void {
    const byActivation = this.#acknowledgements.get(key);
    if (byActivation === undefined) {
      return;
    }
    const active = new Set(
      (cell.state?.activeAlarms ?? []).map((alarm) => activationKey(alarm.code, alarm.raisedAt)),
    );
    for (const activation of byActivation.keys()) {
      if (!active.has(activation)) {
        byActivation.delete(activation);
      }
    }
  }

  /** La célula con los reconocimientos de sus alarmas activas, si los hay. */
  #withAcknowledgements(key: string, cell: CellSnapshot): CellSnapshot {
    const acknowledgements = [...(this.#acknowledgements.get(key)?.values() ?? [])];
    return acknowledgements.length === 0 ? cell : { ...cell, acknowledgements };
  }
}
