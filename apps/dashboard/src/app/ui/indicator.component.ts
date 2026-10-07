import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Un indicador: su nombre y su valor con la unidad. Las cifras usan la fuente
 * de ancho fijo para que no bailen al cambiar (ADR-0020). Sin dato, quien lo
 * usa pasa «—», nunca un cero.
 */
@Component({
  selector: 'app-indicator',
  template: `
    <dl>
      <dt>{{ label() }}</dt>
      <dd [attr.data-testid]="testId()">
        {{ value() }}
        @if (unit(); as unit) {
          <span class="unit">{{ unit }}</span>
        }
      </dd>
    </dl>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    dl {
      margin: 0;
    }
    dt {
      font-size: var(--lf-font-size-sm);
      color: var(--lf-color-text-muted);
    }
    dd {
      margin: 0;
      font-family: var(--lf-font-mono);
      font-size: var(--lf-font-size-lg);
      font-weight: var(--lf-font-weight-semibold);
      font-variant-numeric: tabular-nums;
      color: var(--lf-color-text);
      white-space: nowrap;
    }
    .unit {
      font-family: var(--lf-font-sans);
      font-size: var(--lf-font-size-sm);
      font-weight: var(--lf-font-weight-regular);
      color: var(--lf-color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly unit = input<string | null>(null);
  /** Identificador para las pruebas, en el valor. */
  readonly testId = input<string | null>(null);
}
