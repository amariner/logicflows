import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonRouterLink,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
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

import type { CellView } from '../cell-view';
import { NO_SUMMARY } from '../today-summary';
import type { TodaySummary } from '../today-summary';
import { ProductionIndicatorsComponent } from '../production-indicators/production-indicators.component';

/**
 * Tarjeta de una célula: estado, alarmas activas y producción. Sigue
 * docs/diseno-del-visor.md: cada estado y alarma combinan icono, texto y
 * color, y los estados que requieren atención destacan la tarjeta.
 */
@Component({
  selector: 'app-cell-card',
  templateUrl: './cell-card.component.html',
  styleUrl: './cell-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonIcon,
    IonRouterLink,
    ProductionIndicatorsComponent,
    RouterLink,
  ],
})
export class CellCardComponent {
  readonly cell = input.required<CellView>();
  /** Lo que lleva hoy la célula; sin datos, «—» (LF-91). */
  readonly today = input<TodaySummary | null>(null);
  protected readonly noSummary = NO_SUMMARY;

  constructor() {
    addIcons({
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
  }
}
