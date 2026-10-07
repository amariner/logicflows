import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonRouterLink } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackSharp,
  barChartSharp,
  handLeftSharp,
  helpCircleSharp,
  hourglassSharp,
  informationCircleSharp,
  pauseSharp,
  playSharp,
  stopSharp,
  syncSharp,
  warningSharp,
} from 'ionicons/icons';

import { RealtimeService } from '../../../core/realtime/realtime.service';
import { AlarmItemComponent } from '../../../ui/alarm-item.component';
import { PageHeaderComponent } from '../../../ui/page-header.component';
import { StateBadgeComponent } from '../../../ui/state-badge.component';
import { TODAY_REFRESH_MS } from '../cells.page';
import { CellSchematicComponent } from '../cell-schematic/cell-schematic.component';
import { toCellView } from '../cell-view';
import { EmergencyBannerComponent } from '../emergency-banner/emergency-banner.component';
import { ProductionIndicatorsComponent } from '../production-indicators/production-indicators.component';
import { NO_SUMMARY, TodaySummaries } from '../today-summary';

/**
 * Detalle de una célula en tiempo real (LF-106): su estado, sus alarmas, el
 * esquema de la célula con el palé en curso, los indicadores y lo que lleva
 * hoy. El aviso de parada de emergencia sigue siendo global.
 */
@Component({
  selector: 'app-cell-detail',
  templateUrl: './cell-detail.page.html',
  styleUrl: './cell-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AlarmItemComponent,
    CellSchematicComponent,
    EmergencyBannerComponent,
    IonButton,
    IonContent,
    IonIcon,
    IonRouterLink,
    PageHeaderComponent,
    ProductionIndicatorsComponent,
    RouterLink,
    StateBadgeComponent,
  ],
})
export class CellDetailPage {
  readonly #params = inject(ActivatedRoute).snapshot.paramMap;
  protected readonly siteId = this.#params.get('siteId') ?? '';
  protected readonly cellId = this.#params.get('cellId') ?? '';

  readonly #realtime = inject(RealtimeService);
  readonly #today = inject(TodaySummaries);
  protected readonly connection = this.#realtime.connection;
  protected readonly cells = computed(() =>
    this.#realtime.cells().map((snapshot) => toCellView(snapshot)),
  );
  protected readonly cell = computed(
    () =>
      this.cells().find((cell) => cell.siteId === this.siteId && cell.cellId === this.cellId) ??
      null,
  );
  protected readonly today = computed(
    () => this.#today.summaries().get(`${this.siteId}/${this.cellId}`) ?? NO_SUMMARY,
  );

  constructor() {
    addIcons({
      arrowBackSharp,
      barChartSharp,
      handLeftSharp,
      helpCircleSharp,
      hourglassSharp,
      informationCircleSharp,
      pauseSharp,
      playSharp,
      stopSharp,
      syncSharp,
      warningSharp,
    });
    this.#refreshToday();
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
    const { siteId, cellId } = this;
    this.#today.refresh([{ id: `${siteId}/${cellId}`, siteId, cellId }]);
  }
}
