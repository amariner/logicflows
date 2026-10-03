import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CellCardComponent } from '../cell-card/cell-card.component';
import type { CellView } from '../cell-view';
import type { TodaySummary } from '../today-summary';

/** Rejilla de tarjetas de célula que se adapta al ancho disponible. */
@Component({
  selector: 'app-cell-list',
  templateUrl: './cell-list.component.html',
  styleUrl: './cell-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CellCardComponent],
})
export class CellListComponent {
  readonly cells = input.required<readonly CellView[]>();
  /** Resumen de hoy de cada célula, por su identificador (LF-91). */
  readonly today = input<ReadonlyMap<string, TodaySummary>>(new Map());
}
