import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkDoneSharp } from 'ionicons/icons';

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
  /**
   * «Reconocida por operaria a las 08:32» (ADR-0022). Una alarma reconocida
   * sigue en pantalla, sin fondo de color: ya hay alguien atendiéndola.
   */
  readonly acknowledgedLabel?: string | null;
}

/**
 * Una alarma: severidad escrita con su icono y su color, código, desde
 * cuándo y mensaje. El mensaje va en el color del texto, para leerse igual
 * en cualquier severidad; el color solo marca la severidad (ISA-101). Una
 * alarma reconocida pierde el fondo de color, pero conserva el borde y el
 * texto de su severidad, y dice quién la atiende. Las acciones, como
 * reconocerla, se proyectan al final.
 */
@Component({
  selector: 'app-alarm-item',
  template: `
    @let item = alarm();
    <div class="alarm" [class]="'tone-' + item.tone" [class.acknowledged]="item.acknowledgedLabel">
      <ion-icon aria-hidden="true" [name]="item.icon" />
      <div>
        <p class="heading">
          <strong>{{ item.severityLabel }}</strong> · <span class="code">{{ item.code }}</span>
          @if (item.sinceLabel) {
            · {{ item.sinceLabel }}
          }
        </p>
        <p>{{ item.message }}</p>
        @if (item.acknowledgedLabel) {
          <p class="acknowledgement" data-testid="acknowledgement">
            <ion-icon aria-hidden="true" name="checkmark-done-sharp" />
            {{ item.acknowledgedLabel }}
          </p>
        }
        <ng-content />
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
    .acknowledged {
      background: var(--lf-color-surface-2);
    }
    .acknowledgement {
      display: flex;
      align-items: center;
      gap: var(--lf-space-1);
      color: var(--lf-color-text-muted);
    }
    .acknowledgement ion-icon {
      margin-top: 0;
      color: var(--lf-color-text-muted);
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
  constructor() {
    addIcons({ checkmarkDoneSharp });
  }

  readonly alarm = input.required<AlarmPresentation>();
}
