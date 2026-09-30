import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
} from '@ionic/angular';

import type { CellView } from '../cell-view';

/**
 * Tarjetas de las células con el contador de cajas destacado para leerlo a
 * distancia. Componente de presentación: recibe los datos ya preparados.
 */
@Component({
  selector: 'app-cell-list',
  templateUrl: './cell-list.component.html',
  styleUrl: './cell-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle],
})
export class CellListComponent {
  readonly cells = input.required<readonly CellView[]>();
}
