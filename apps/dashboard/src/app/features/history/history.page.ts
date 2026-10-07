import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonRouterLink } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackSharp, downloadSharp } from 'ionicons/icons';
import { EMPTY, Subject, catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { RealtimeService } from '../../core/realtime/realtime.service';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { BarChartComponent } from './bar-chart/bar-chart.component';
import { EventsLogComponent } from './events-log/events-log.component';
import { toEventsView } from './events-view';
import type { EventsView } from './events-view';
import { HistoryApi } from './history.api';
import { historyCsvName, toHistoryCsv } from './history-csv';
import { FileExport } from './history-export';
import type { CellHistory } from './history.types';
import { toHistoryView } from './history-view';
import type { HistoryView } from './history-view';
import { deviceTimeZone, periodQuery } from './period';
import type { PeriodChoice } from './period';

/** Cada cuánto se actualiza «Hoy» mientras la página está visible (LF-87). */
export const HISTORY_REFRESH_MS = new InjectionToken<number>('HISTORY_REFRESH_MS', {
  factory: () => 60_000,
});

interface Request {
  readonly choice: PeriodChoice;
  /** Actualización en segundo plano: sin «Cargando» y sin borrar lo que se ve si falla. */
  readonly silent: boolean;
}

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly history: CellHistory;
      readonly view: HistoryView;
      readonly events: EventsView;
    };

const PERIODS: readonly { readonly value: PeriodChoice; readonly label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: '7 días' },
  { value: 'month', label: '30 días' },
];

/**
 * Histórico de una célula: producción del periodo, indicadores de planta y
 * paradas por causa (docs/indicadores-de-planta.md).
 */
@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrl: './history.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BarChartComponent,
    EventsLogComponent,
    IonButton,
    IonContent,
    IonIcon,
    IonRouterLink,
    PageHeaderComponent,
    RouterLink,
  ],
})
export class HistoryPage {
  readonly #api = inject(HistoryApi);
  readonly #files = inject(FileExport);
  readonly #params = inject(ActivatedRoute).snapshot.paramMap;
  readonly #requests = new Subject<Request>();
  protected readonly siteId = this.#params.get('siteId') ?? '';
  protected readonly cellId = this.#params.get('cellId') ?? '';
  protected readonly periods = PERIODS;
  protected readonly choice = signal<PeriodChoice>('today');
  protected readonly state = signal<PageState>({ kind: 'loading' });
  protected readonly connection = inject(RealtimeService).connection;

  constructor() {
    addIcons({ arrowBackSharp, downloadSharp });
    this.#requests
      .pipe(
        switchMap(({ choice, silent }) => {
          const query = periodQuery(choice, new Date(), deviceTimeZone());
          return forkJoin({
            history: this.#api.load(this.siteId, this.cellId, query),
            events: this.#api.loadEvents(this.siteId, this.cellId, query),
          }).pipe(
            map(({ history, events }): PageState => ({
              kind: 'ready',
              history,
              view: toHistoryView(history),
              events: toEventsView(events, query.timeZone),
            })),
            catchError((error: unknown) => (silent ? EMPTY : of<PageState>(failure(error)))),
            silent ? (source) => source : startWith<PageState>({ kind: 'loading' }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
      });
    this.reload();
    this.#refreshTodayPeriodically();
    // Al recuperar la conexión, se reintenta sin esperar al usuario. Solo al
    // pasar a abierta: un error con la conexión abierta no se reintenta solo.
    let previous = this.connection();
    effect(() => {
      const current = this.connection();
      if (current === 'open' && previous !== 'open' && untracked(this.state).kind === 'error') {
        this.reload();
      }
      previous = current;
    });
  }

  protected select(choice: PeriodChoice): void {
    if (choice !== this.choice()) {
      this.choice.set(choice);
      this.reload();
    }
  }

  /** Descarga el periodo que se está viendo en CSV (LF-88). */
  protected async download(): Promise<void> {
    const current = this.state();
    if (current.kind !== 'ready') {
      return;
    }
    await this.#files.save(
      historyCsvName(current.history),
      toHistoryCsv(current.history),
      'text/csv;charset=utf-8',
    );
  }

  protected reload(): void {
    this.#requests.next({ choice: this.choice(), silent: false });
  }

  /**
   * «Hoy» cambia mientras se mira: se vuelve a pedir cada minuto si la
   * página está visible, hay conexión y ya se mostró (LF-87). 7 y 30 días no.
   */
  #refreshTodayPeriodically(): void {
    const timer = setInterval(() => {
      if (
        this.choice() === 'today' &&
        this.state().kind === 'ready' &&
        this.connection() === 'open' &&
        document.visibilityState === 'visible'
      ) {
        this.#requests.next({ choice: 'today', silent: true });
      }
    }, inject(HISTORY_REFRESH_MS));
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }
}

function failure(error: unknown): PageState {
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return { kind: 'error', message: 'Sin conexión con la API: no hay datos del histórico.' };
  }
  if (error instanceof HttpErrorResponse && error.status === 404) {
    return { kind: 'error', message: 'No hay datos de esta célula.' };
  }
  return { kind: 'error', message: 'No se pudo cargar el histórico.' };
}
