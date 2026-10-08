import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonRouterLink } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackSharp,
  arrowDownSharp,
  arrowUpSharp,
  downloadSharp,
  warningSharp,
} from 'ionicons/icons';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';

import { RealtimeService } from '../../core/realtime/realtime.service';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { FileExport } from '../history/history-export';
import { deviceTimeZone, periodQuery } from '../history/period';
import type { PeriodChoice } from '../history/period';
import { ComparisonApi } from './comparison.api';
import { comparisonCsvName, toComparisonCsv } from './comparison-csv';
import { toComparisonView } from './comparison-view';
import type { Sort, SortKey } from './comparison-view';
import type { SiteComparison } from './comparison.types';

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly comparison: SiteComparison };

const PERIODS: readonly { readonly value: PeriodChoice; readonly label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: '7 días' },
  { value: 'month', label: '30 días' },
];

const COLUMNS: readonly { readonly key: SortKey; readonly label: string }[] = [
  { key: 'cell', label: 'Célula' },
  { key: 'boxes', label: 'Cajas' },
  { key: 'availability', label: 'Disponibilidad' },
  { key: 'performance', label: 'Rendimiento' },
];

/**
 * Comparación de las células de una planta (LF-130): los mismos indicadores
 * de cada una en el mismo periodo, con la peor señalada sin depender del
 * color. En el móvil, una lista en lugar de una tabla ancha.
 */
@Component({
  selector: 'app-comparison',
  templateUrl: './comparison.page.html',
  styleUrl: './comparison.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonContent, IonIcon, IonRouterLink, PageHeaderComponent, RouterLink],
})
export class ComparisonPage {
  readonly #api = inject(ComparisonApi);
  readonly #files = inject(FileExport);
  readonly #realtime = inject(RealtimeService);
  readonly #requests = new Subject<{ siteId: string; choice: PeriodChoice }>();
  protected readonly connection = this.#realtime.connection;
  protected readonly periods = PERIODS;
  protected readonly columns = COLUMNS;
  protected readonly choice = signal<PeriodChoice>('today');
  protected readonly sort = signal<Sort>({ key: 'availability', descending: false });
  protected readonly state = signal<PageState>({ kind: 'loading' });
  /** La planta de las células conocidas: la demo tiene una. */
  protected readonly siteId = computed(
    () =>
      [...this.#realtime.cells()]
        .map((cell) => cell.siteId)
        .sort((a, b) => a.localeCompare(b))[0] ?? null,
  );
  protected readonly view = computed(() => {
    const current = this.state();
    return current.kind === 'ready' ? toComparisonView(current.comparison, this.sort()) : null;
  });

  constructor() {
    addIcons({ arrowBackSharp, arrowDownSharp, arrowUpSharp, downloadSharp, warningSharp });
    this.#requests
      .pipe(
        switchMap(({ siteId, choice }) =>
          this.#api.load(siteId, periodQuery(choice, new Date(), deviceTimeZone())).pipe(
            map((comparison): PageState => ({ kind: 'ready', comparison })),
            catchError((error: unknown) => of<PageState>(failure(error))),
            startWith<PageState>({ kind: 'loading' }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
      });
    // Se carga en cuanto se conoce la planta y cada vez que cambia el periodo.
    effect(() => {
      const siteId = this.siteId();
      if (siteId !== null) {
        this.#requests.next({ siteId, choice: this.choice() });
      }
    });
  }

  protected select(choice: PeriodChoice): void {
    this.choice.set(choice);
  }

  /** Ordena por la columna; otra vez, en sentido contrario. */
  protected sortBy(key: SortKey): void {
    const current = this.sort();
    this.sort.set({
      key,
      descending: current.key === key ? !current.descending : key !== 'cell',
    });
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    const current = this.sort();
    if (current.key !== key) {
      return 'none';
    }
    return current.descending ? 'descending' : 'ascending';
  }

  protected reload(): void {
    const siteId = this.siteId();
    if (siteId !== null) {
      this.#requests.next({ siteId, choice: this.choice() });
    }
  }

  protected async download(): Promise<void> {
    const current = this.state();
    if (current.kind !== 'ready') {
      return;
    }
    await this.#files.save(
      comparisonCsvName(current.comparison),
      toComparisonCsv(current.comparison),
      'text/csv;charset=utf-8',
    );
  }
}

function failure(error: unknown): PageState {
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return { kind: 'error', message: 'Sin conexión con la API: no hay datos para comparar.' };
  }
  return { kind: 'error', message: 'No se pudo cargar la comparación.' };
}
