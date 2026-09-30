import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudDoneSharp, cloudOfflineSharp, syncSharp } from 'ionicons/icons';

import type { ConnectionState } from '../realtime/realtime.service';

const PRESENTATION: Readonly<
  Record<ConnectionState, { label: string; icon: string; color: string }>
> = {
  open: { label: 'En directo', icon: 'cloud-done-sharp', color: 'success' },
  connecting: { label: 'Conectando…', icon: 'sync-sharp', color: 'warning' },
  closed: { label: 'Sin conexión', icon: 'cloud-offline-sharp', color: 'danger' },
};

/**
 * Estado de la conexión con la API. Combina icono, texto y color para no
 * depender solo del color, y anuncia los cambios a los lectores de pantalla.
 */
@Component({
  selector: 'app-connection-status',
  template: `
    <ion-chip [color]="view().color" role="status" aria-live="polite">
      <ion-icon aria-hidden="true" [name]="view().icon" />
      <ion-label>{{ view().label }}</ion-label>
    </ion-chip>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonChip, IonIcon, IonLabel],
})
export class ConnectionStatusComponent {
  readonly state = input.required<ConnectionState>();
  protected readonly view = computed(() => PRESENTATION[this.state()]);

  constructor() {
    addIcons({ cloudDoneSharp, cloudOfflineSharp, syncSharp });
  }
}
