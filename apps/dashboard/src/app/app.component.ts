import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonButton,
  IonFooter,
  IonNote,
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
import { gridSharp, logOutSharp } from 'ionicons/icons';

import { AuthService } from './core/auth/auth';
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
    IonButton,
    IonFooter,
    IonNote,
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
  protected readonly auth = inject(AuthService);
  protected readonly menu: readonly MenuEntry[] = [
    { title: 'Células', url: '/cells', icon: 'grid-sharp' },
  ];

  constructor() {
    addIcons({ gridSharp, logOutSharp });
    // El canal de tiempo real se abre al arrancar, una vez cargada la
    // configuración y comprobada la sesión.
    const realtime = inject(RealtimeService);
    void this.auth.ensureSession().then((authenticated) => {
      if (authenticated) {
        realtime.start();
      }
    });
  }
}
