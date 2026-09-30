import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenu,
  IonMenuToggle,
  IonRouterLink,
  IonRouterOutlet,
  IonSplitPane,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { gridSharp } from 'ionicons/icons';

import { RealtimeService } from './core/realtime/realtime.service';

interface MenuEntry {
  readonly title: string;
  readonly url: string;
  readonly icon: string;
}

/**
 * Estructura del visor (ADR-0002): menú lateral fijo en pantallas anchas y
 * desplegable en móvil.
 */
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonMenu,
    IonMenuToggle,
    IonRouterLink,
    IonRouterOutlet,
    IonSplitPane,
  ],
})
export class AppComponent {
  protected readonly menu: readonly MenuEntry[] = [
    { title: 'Células', url: '/cells', icon: 'grid-sharp' },
  ];

  constructor() {
    addIcons({ gridSharp });
    // El canal de tiempo real se abre al arrancar, una vez cargada la configuración.
    inject(RealtimeService).start();
  }
}
