import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudOfflineSharp, syncSharp } from 'ionicons/icons';

import type { Tone } from '../../ui/presentation';
import type { ConnectionState } from '../realtime/realtime.service';

const PRESENTATION: Readonly<
  Record<ConnectionState, { label: string; icon: string | null; tone: Tone }>
> = {
  // En directo, un punto que late en lugar de un icono.
  open: { label: 'En directo', icon: null, tone: 'ok' },
  connecting: { label: 'Conectando…', icon: 'sync-sharp', tone: 'warning' },
  closed: { label: 'Sin conexión', icon: 'cloud-offline-sharp', tone: 'danger' },
};

/**
 * Estado de la conexión con la API: «En directo» con un punto que late, o un
 * aviso. Combina icono, texto y color para no depender solo del color, y
 * anuncia los cambios a los lectores de pantalla.
 */
@Component({
  selector: 'app-connection-status',
  template: `
    @let current = view();
    <span class="status" [class]="'tone-' + current.tone" role="status" aria-live="polite">
      @if (current.icon; as icon) {
        <ion-icon aria-hidden="true" [name]="icon" />
      } @else {
        <span class="pulse" aria-hidden="true"></span>
      }
      {{ current.label }}
    </span>
  `,
  styles: `
    .status {
      display: inline-flex;
      align-items: center;
      gap: var(--lf-space-2);
      padding: var(--lf-space-1) var(--lf-space-3);
      border-radius: var(--lf-radius-full);
      background: var(--bg);
      color: var(--fg);
      font-size: var(--lf-font-size-sm);
      font-weight: var(--lf-font-weight-medium);
      white-space: nowrap;
    }
    .pulse {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--lf-radius-full);
      background: var(--fg);
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.35;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .pulse {
        animation: none;
      }
    }
    .tone-ok {
      --fg: var(--lf-color-ok-fg);
      --bg: var(--lf-color-ok-bg);
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
export class ConnectionStatusComponent {
  readonly state = input.required<ConnectionState>();
  protected readonly view = computed(() => PRESENTATION[this.state()]);

  constructor() {
    addIcons({ cloudOfflineSharp, syncSharp });
  }
}
