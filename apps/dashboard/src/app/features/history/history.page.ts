import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonRouterLink,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackSharp } from 'ionicons/icons';
import { Subject, catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { ConnectionStatusComponent } from '../../core/connection-status/connection-status.component';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { BarChartComponent } from './bar-chart/bar-chart.component';
import { EventsLogComponent } from './events-log/events-log.component';
import { toEventsView } from './events-view';
import type { EventsView } from './events-view';
import { HistoryApi } from './history.api';
import { toHistoryView } from './history-view';
import type { HistoryView } from './history-view';
import { deviceTimeZone, periodQuery } from './period';
import type { PeriodChoice } from './period';

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly view: HistoryView; readonly events: EventsView };

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
    ConnectionStatusComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonRouterLink,
    RouterLink,
    IonTitle,
    IonToolbar,
  ],
})
export class HistoryPage {
  readonly #api = inject(HistoryApi);
  readonly #params = inject(ActivatedRoute).snapshot.paramMap;
  readonly #requests = new Subject<PeriodChoice>();
  protected readonly siteId = this.#params.get('siteId') ?? '';
  protected readonly cellId = this.#params.get('cellId') ?? '';
  protected readonly periods = PERIODS;
  protected readonly choice = signal<PeriodChoice>('today');
  protected readonly state = signal<PageState>({ kind: 'loading' });
  protected readonly connection = inject(RealtimeService).connection;

  constructor() {
    addIcons({ arrowBackSharp });
    this.#requests
      .pipe(
        switchMap((choice) => {
          const query = periodQuery(choice, new Date(), deviceTimeZone());
          return forkJoin({
            history: this.#api.load(this.siteId, this.cellId, query),
            events: this.#api.loadEvents(this.siteId, this.cellId, query),
          }).pipe(
            map(({ history, events }): PageState => ({
              kind: 'ready',
              view: toHistoryView(history),
              events: toEventsView(events, query.timeZone),
            })),
            catchError((error: unknown) => of<PageState>(failure(error))),
            startWith<PageState>({ kind: 'loading' }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
      });
    this.reload();
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

  protected reload(): void {
    this.#requests.next(this.choice());
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
