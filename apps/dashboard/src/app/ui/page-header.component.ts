import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonButtons, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { ConnectionStatusComponent } from '../core/connection-status/connection-status.component';
import type { ConnectionState } from '../core/realtime/realtime.service';

/**
 * Cabecera de una página: la acción de navegación a la izquierda (lo que se
 * proyecta con el atributo `headerStart`), el título y el estado de la
 * conexión. Lo que se proyecta sin atributo va debajo de la barra, como el
 * aviso de parada de emergencia.
 */
@Component({
  selector: 'app-page-header',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ng-content select="[headerStart]" />
        </ion-buttons>
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <app-connection-status [state]="connection()" />
        </ion-buttons>
      </ion-toolbar>
      <ng-content />
    </ion-header>
  `,
  styles: `
    :host {
      display: block;
    }
    ion-toolbar {
      --border-color: var(--lf-color-border);
      --padding-end: var(--lf-space-3);
    }
    ion-title {
      font-size: var(--lf-font-size-lg);
      font-weight: var(--lf-font-weight-semibold);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConnectionStatusComponent, IonButtons, IonHeader, IonTitle, IonToolbar],
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly connection = input.required<ConnectionState>();
}
