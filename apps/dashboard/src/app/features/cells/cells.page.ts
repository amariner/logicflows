import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import type { CellView } from './cell-view';
import { CellListComponent } from './cell-list/cell-list.component';

/** Página de las células. Los datos en tiempo real llegan con LF-28. */
@Component({
  selector: 'app-cells',
  templateUrl: './cells.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CellListComponent,
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonTitle,
    IonToolbar,
  ],
})
export class CellsPage {
  protected readonly cells = signal<readonly CellView[]>([]);
}
