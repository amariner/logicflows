import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';

import type { CellView } from '../cell-view';

/** Lista de células. Componente de presentación: recibe los datos ya preparados. */
@Component({
  selector: 'app-cell-list',
  templateUrl: './cell-list.component.html',
  styleUrl: './cell-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonItem, IonLabel, IonList, IonNote],
})
export class CellListComponent {
  readonly cells = input.required<readonly CellView[]>();
}
