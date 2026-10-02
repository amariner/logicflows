import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
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
  IonToast,
  Platform,
} from '@ionic/angular';
import type { ToastButton } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { gridSharp, logOutSharp } from 'ionicons/icons';

import { AuthService } from './core/auth/auth';
import { AppUpdateService } from './core/pwa/app-update';
import { exitOnRootBackButton } from './core/native/back-button';
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
    IonToast,
  ],
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  protected readonly updates = inject(AppUpdateService);
  protected readonly updateButtons: ToastButton[] = [
    {
      text: 'Actualizar',
      handler: () => {
        this.updates.reload();
      },
    },
  ];
  private readonly outlet = viewChild.required(IonRouterOutlet);
  protected readonly menu: readonly MenuEntry[] = [
    { title: 'Células', url: '/cells', icon: 'grid-sharp' },
  ];

  protected reload(): void {
    window.location.reload();
  }

  constructor() {
    addIcons({ gridSharp, logOutSharp });
    if (Capacitor.isNativePlatform()) {
      exitOnRootBackButton(
        inject(Platform),
        () => this.outlet().canGoBack(),
        () => App.exitApp(),
      );
    }
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
