import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { Bar } from '../history-view';

/** Ancho de cada barra en el sistema de coordenadas del SVG, con su hueco. */
const SLOT = 10;

/**
 * Gráfico de barras de la producción. Es un SVG propio, sin librería: el
 * resumen lo leen los lectores de pantalla y la tabla equivalente está a un
 * clic para cualquiera (WCAG 1.1.1 y 1.3.1).
 */
@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.component.html',
  styleUrl: './bar-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarChartComponent {
  readonly title = input.required<string>();
  readonly summary = input.required<string>();
  readonly bars = input.required<readonly Bar[]>();
  /** Máximo del eje, ya formateado. */
  readonly max = input.required<string>();

  protected readonly width = computed(() => Math.max(1, this.bars().length) * SLOT);
  protected readonly rects = computed(() =>
    this.bars().map((bar, index) => ({
      x: index * SLOT + 1,
      // Una barra con producción nunca desaparece del todo.
      height: bar.ratio === 0 ? 0 : Math.max(1, bar.ratio * 100),
    })),
  );
  protected readonly firstLabel = computed(() => this.bars().at(0)?.label ?? '');
  protected readonly lastLabel = computed(() => this.bars().at(-1)?.label ?? '');
}
