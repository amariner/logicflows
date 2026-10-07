import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonProgressBar } from '@ionic/angular';

import type { ProductionIndicators } from '../indicators';
import { IndicatorComponent } from '../../../ui/indicator.component';

/**
 * Indicadores de producción de una célula: cajas destacadas para leerlas a
 * distancia y, debajo, palés, capa con el avance del palé, ritmo y tiempo
 * de ciclo, siempre con sus unidades.
 */
@Component({
  selector: 'app-production-indicators',
  templateUrl: './production-indicators.component.html',
  styleUrl: './production-indicators.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IndicatorComponent, IonProgressBar],
})
export class ProductionIndicatorsComponent {
  readonly indicators = input.required<ProductionIndicators>();
  /** Atenúa los valores cuando son el último dato conocido de una célula desconectada. */
  readonly stale = input(false);
}
