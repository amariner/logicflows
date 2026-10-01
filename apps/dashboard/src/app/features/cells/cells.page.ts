import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
}
