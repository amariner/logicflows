import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { handLeftSharp } from 'ionicons/icons';

import type { CellView } from '../cell-view';

/**
 * Aviso global cuando alguna célula está en parada de emergencia: la
 * situación más grave se ve en cualquier tamaño de pantalla y se anuncia a los
 * lectores de pantalla.
 */
@Component({
  selector: 'app-emergency-banner',
  template: `
    @if (stopped().length > 0) {
      <div class="banner" role="alert">
        <ion-icon aria-hidden="true" name="hand-left-sharp" />
        <p>
          <strong>Parada de emergencia</strong> en
          {{ stopped().join(', ') }}
        </p>
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      gap: var(--lf-space-3);
      padding: var(--lf-space-3) var(--lf-space-4);
      background: var(--lf-color-danger-fg);
      color: var(--lf-color-surface-0);
      font-size: var(--lf-font-size-lg);
      line-height: var(--lf-line-height-tight);
    }
    ion-icon {
      font-size: var(--lf-font-size-xl);
      flex-shrink: 0;
    }
    p {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
})
export class EmergencyBannerComponent {
  readonly cells = input.required<readonly CellView[]>();
  protected readonly stopped = computed(() =>
    this.cells()
      .filter((cell) => cell.state === 'EMERGENCY_STOP')
      .map((cell) => cell.cellId),
  );

  constructor() {
    addIcons({ handLeftSharp });
  }
}
