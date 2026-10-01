import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonProgressBar } from '@ionic/angular';

import type { ProductionIndicators } from '../indicators';

/**
 * Indicadores de producción de una célula: cajas destacadas para leerlas a
 * distancia y, debajo, pallets, capa con el avance del pallet, ritmo y tiempo
 * de ciclo, siempre con sus unidades.
 */
@Component({
  selector: 'app-production-indicators',
  templateUrl: './production-indicators.component.html',
  styleUrl: './production-indicators.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonProgressBar],
})
export class ProductionIndicatorsComponent {
  readonly indicators = input.required<ProductionIndicators>();
  /** Atenúa los valores cuando son el último dato conocido de una célula desconectada. */
  readonly stale = input(false);
}
