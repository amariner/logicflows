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
  IonSegment,
  IonSegmentButton,
  IonSplitPane,
  IonToast,
  IonToggle,
  Platform,
} from '@ionic/angular';
import type { ToastButton } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarSharp, gridSharp, logOutSharp, statsChartSharp } from 'ionicons/icons';

import { AuthService } from './core/auth/auth';
import { AppUpdateService } from './core/pwa/app-update';
import { AlarmNotificationsService } from './core/native/alarm-notifications';
import { exitOnRootBackButton } from './core/native/back-button';
import { RealtimeService } from './core/realtime/realtime.service';
import { ThemeService } from './core/theme/theme';

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
    IonSegment,
    IonSegmentButton,
    IonSplitPane,
    IonToast,
    IonToggle,
  ],
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  protected readonly updates = inject(AppUpdateService);
  protected readonly notifications = inject(AlarmNotificationsService);
  protected readonly theme = inject(ThemeService);
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
    { title: 'Comparar', url: '/comparison', icon: 'stats-chart-sharp' },
    { title: 'Turnos', url: '/calendar', icon: 'calendar-sharp' },
  ];

  /** Al cerrar sesión, el dispositivo deja de recibir avisos (ADR-0015). */
  protected async logout(): Promise<void> {
    try {
      await this.notifications.forgetDevice();
    } catch {
      // La sesión se cierra igualmente; la API olvida el token cuando FCM lo invalide.
    }
    this.auth.logout();
  }

  protected toggleNotifications(event: CustomEvent<{ checked: boolean }>): void {
    void this.notifications.setEnabled(event.detail.checked);
  }

  protected chooseTheme(event: CustomEvent<{ value?: string | number }>): void {
    const value = event.detail.value;
    if (value === 'system' || value === 'light' || value === 'dark') {
      this.theme.choose(value);
    }
  }

  protected reload(): void {
    this.auth.retryLogin();
  }

  constructor() {
    addIcons({ calendarSharp, gridSharp, logOutSharp, statsChartSharp });
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
        void this.notifications.start();
      }
    });
  }
}
