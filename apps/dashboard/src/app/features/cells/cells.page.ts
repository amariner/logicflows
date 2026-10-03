import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { ConnectionStatusComponent } from '../../core/connection-status/connection-status.component';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { CellListComponent } from './cell-list/cell-list.component';
import { EmergencyBannerComponent } from './emergency-banner/emergency-banner.component';
import { toCellView } from './cell-view';
import { TodaySummaries } from './today-summary';

/** Cada cuánto se actualiza el resumen de hoy de las tarjetas (LF-91). */
export const TODAY_REFRESH_MS = new InjectionToken<number>('TODAY_REFRESH_MS', {
  factory: () => 300_000,
});

/** Página de las células con su producción en tiempo real. */
@Component({
  selector: 'app-cells',
  templateUrl: './cells.page.html',
  styles: `
    .cells:focus-visible {
      outline: 2px solid var(--ion-color-primary);
      outline-offset: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CellListComponent,
    ConnectionStatusComponent,
    EmergencyBannerComponent,
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonTitle,
    IonToolbar,
  ],
})
export class CellsPage {
  readonly #realtime = inject(RealtimeService);
  protected readonly connection = this.#realtime.connection;
  protected readonly cells = computed(() =>
    this.#realtime.cells().map((snapshot) => toCellView(snapshot)),
  );
  readonly #today = inject(TodaySummaries);
  protected readonly today = this.#today.summaries;

  constructor() {
    // Al aparecer una célula nueva se pide su resumen sin esperar.
    const ids = computed(() =>
      this.cells()
        .map((cell) => cell.id)
        .join(','),
    );
    effect(() => {
      ids();
      untracked(() => {
        this.#refreshToday();
      });
    });
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.#refreshToday();
      }
    }, inject(TODAY_REFRESH_MS));
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }

  #refreshToday(): void {
    this.#today.refresh(this.cells());
  }
}
