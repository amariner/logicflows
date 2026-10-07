import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import type { Tone } from './presentation';

/** Lo que muestra una alarma activa. */
export interface AlarmPresentation {
  readonly code: string;
  readonly message: string;
  readonly severityLabel: string;
  readonly icon: string;
  readonly tone: Tone;
  /** «desde las 08:30», o `null` si no aplica. */
  readonly sinceLabel?: string | null;
}

/**
 * Una alarma: severidad escrita con su icono y su color, código, desde
 * cuándo y mensaje. El mensaje va en el color del texto, para leerse igual
 * en cualquier severidad; el color solo marca la severidad (ISA-101).
 */
@Component({
  selector: 'app-alarm-item',
  template: `
    @let item = alarm();
    <div class="alarm" [class]="'tone-' + item.tone">
      <ion-icon aria-hidden="true" [name]="item.icon" />
      <div>
        <p class="heading">
          <strong>{{ item.severityLabel }}</strong> · <span class="code">{{ item.code }}</span>
          @if (item.sinceLabel) {
            · {{ item.sinceLabel }}
          }
        </p>
        <p>{{ item.message }}</p>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .alarm {
      display: flex;
      gap: var(--lf-space-2);
      padding: var(--lf-space-2) var(--lf-space-3);
      border-left: var(--lf-space-1) solid var(--fg);
      border-radius: var(--lf-radius-md);
      background: var(--bg);
      color: var(--lf-color-text);
      font-size: var(--lf-font-size-sm);
      line-height: var(--lf-line-height-normal);
    }
    ion-icon {
      flex-shrink: 0;
      margin-top: var(--lf-space-1);
      color: var(--fg);
      font-size: var(--lf-font-size-md);
    }
    p {
      margin: 0;
    }
    strong {
      color: var(--fg);
    }
    .code {
      font-family: var(--lf-font-mono);
    }
    .tone-info {
      --fg: var(--lf-color-info-fg);
      --bg: var(--lf-color-info-bg);
    }
    .tone-warning {
      --fg: var(--lf-color-warning-fg);
      --bg: var(--lf-color-warning-bg);
    }
    .tone-danger {
      --fg: var(--lf-color-danger-fg);
      --bg: var(--lf-color-danger-bg);
    }
    .tone-ok {
      --fg: var(--lf-color-ok-fg);
      --bg: var(--lf-color-ok-bg);
    }
    .tone-neutral {
      --fg: var(--lf-color-neutral-fg);
      --bg: var(--lf-color-neutral-bg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
})
export class AlarmItemComponent {
  readonly alarm = input.required<AlarmPresentation>();
}
