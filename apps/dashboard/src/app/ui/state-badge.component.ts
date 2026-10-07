import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import type { Tone } from './presentation';

/**
 * Etiqueta de estado: icono, texto y color a la vez, nunca solo color
 * (WCAG 1.4.1). El tono sale de los tokens de diseño (ADR-0020), así que
 * sirve en claro y en oscuro. Los iconos los registra quien la usa.
 */
@Component({
  selector: 'app-state-badge',
  template: `
    <span class="badge" [class]="'tone-' + tone() + ' size-' + size()">
      <ion-icon aria-hidden="true" [name]="icon()" />
      <span>{{ label() }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
      max-width: 100%;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--lf-space-2);
      padding: var(--lf-space-1) var(--lf-space-3);
      border-radius: var(--lf-radius-full);
      background: var(--bg);
      color: var(--fg);
      font-weight: var(--lf-font-weight-semibold);
      font-size: var(--lf-font-size-sm);
      line-height: var(--lf-line-height-tight);
    }
    .size-lg {
      padding: var(--lf-space-2) var(--lf-space-4);
      font-size: var(--lf-font-size-lg);
    }
    ion-icon {
      flex-shrink: 0;
      font-size: 1.25em;
    }
    .tone-ok {
      --fg: var(--lf-color-ok-fg);
      --bg: var(--lf-color-ok-bg);
    }
    .tone-info {
      --fg: var(--lf-color-info-fg);
      --bg: var(--lf-color-info-bg);
    }
    .tone-neutral {
      --fg: var(--lf-color-neutral-fg);
      --bg: var(--lf-color-neutral-bg);
    }
    .tone-warning {
      --fg: var(--lf-color-warning-fg);
      --bg: var(--lf-color-warning-bg);
    }
    .tone-danger {
      --fg: var(--lf-color-danger-fg);
      --bg: var(--lf-color-danger-bg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
})
export class StateBadgeComponent {
  readonly label = input.required<string>();
  readonly icon = input.required<string>();
  readonly tone = input.required<Tone>();
  readonly size = input<'md' | 'lg'>('md');
}
