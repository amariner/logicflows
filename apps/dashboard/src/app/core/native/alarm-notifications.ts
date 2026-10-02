import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../config/app-config';

/** Canal de Android de los avisos; la API lo indica en cada aviso (ADR-0015). */
export const ALARM_CHANNEL_ID = 'alarmas';

/** Preferencia de la persona, guardada en el dispositivo. */
export const NOTIFICATIONS_PREFERENCE_KEY = 'logicflows.avisos';

/** Lo que los avisos necesitan de la app nativa (LF-69); se sustituye en las pruebas. */
export interface NativePush {
  readonly native: boolean;
  createAlarmChannel(): Promise<void>;
  /** Pide permiso si hace falta (Android 13 o superior) y dice si se concedió. */
  requestPermission(): Promise<boolean>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  onRegistration(handler: (token: string) => void): void;
  /** La persona tocó un aviso. */
  onNotificationOpened(handler: () => void): void;
}

export const NATIVE_PUSH = new InjectionToken<NativePush>('NATIVE_PUSH', {
  providedIn: 'root',
  factory: (): NativePush => ({
    native: Capacitor.isNativePlatform(),
    createAlarmChannel: () =>
      PushNotifications.createChannel({
        id: ALARM_CHANNEL_ID,
        name: 'Alarmas',
        description: 'Alarmas graves de las células de paletizado',
        importance: 5,
        visibility: 1,
        vibration: true,
      }),
    requestPermission: async () => {
      let status = await PushNotifications.checkPermissions();
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
        status = await PushNotifications.requestPermissions();
      }
      return status.receive === 'granted';
    },
    register: () => PushNotifications.register(),
    unregister: () => PushNotifications.unregister(),
    onRegistration: (handler) => {
      void PushNotifications.addListener('registration', (token) => {
        handler(token.value);
      });
    },
    onNotificationOpened: (handler) => {
      void PushNotifications.addListener('pushNotificationActionPerformed', handler);
    },
  }),
});

/**
 * Avisos de alarmas graves en la app Android (ADR-0015). Tras iniciar sesión,
 * pide permiso, obtiene el token de Firebase Cloud Messaging y lo registra en
 * la API. La persona puede desactivarlos; al cerrar sesión, el dispositivo
 * deja de recibirlos.
 */
@Injectable({ providedIn: 'root' })
export class AlarmNotificationsService {
  readonly #push = inject(NATIVE_PUSH);
  readonly #http = inject(HttpClient);
  readonly #config = inject(AppConfigService);
  readonly #router = inject(Router);
  readonly #enabled = signal(readPreference());
  #token: string | undefined;
  #listening = false;

  /** Solo hay avisos en la app nativa. */
  readonly available = this.#push.native;

  /** La persona quiere recibir avisos en este dispositivo. */
  readonly enabled = this.#enabled.asReadonly();

  /** Se llama con la sesión iniciada. Sin preferencia en contra, activa los avisos. */
  async start(): Promise<void> {
    if (!this.available || !this.#enabled()) {
      return;
    }
    this.#listen();
    await this.#push.createAlarmChannel();
    if (await this.#push.requestPermission()) {
      await this.#push.register();
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.#enabled.set(enabled);
    writePreference(enabled);
    if (enabled) {
      await this.start();
    } else {
      await this.forgetDevice();
    }
  }

  /** Deja de recibir avisos: al cerrar sesión o al desactivarlos. */
  async forgetDevice(): Promise<void> {
    const token = this.#token;
    this.#token = undefined;
    if (!this.available || token === undefined) {
      return;
    }
    try {
      await firstValueFrom(this.#http.delete(this.#devicesUrl(), { body: { token } }));
    } finally {
      await this.#push.unregister();
    }
  }

  #listen(): void {
    if (this.#listening) {
      return;
    }
    this.#listening = true;
    this.#push.onRegistration((token) => {
      this.#token = token;
      // Si falla, se reintenta la próxima vez que arranque la app.
      this.#http.post(this.#devicesUrl(), { token }).subscribe({ error: () => undefined });
    });
    this.#push.onNotificationOpened(() => {
      void this.#router.navigateByUrl('/cells');
    });
  }

  #devicesUrl(): string {
    return `${this.#config.config.apiUrl}/api/v1/push/devices`;
  }
}

function readPreference(): boolean {
  try {
    return localStorage.getItem(NOTIFICATIONS_PREFERENCE_KEY) !== 'no';
  } catch {
    return true;
  }
}

function writePreference(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFICATIONS_PREFERENCE_KEY, enabled ? 'si' : 'no');
  } catch {
    // Sin almacenamiento, la preferencia dura lo que la sesión.
  }
}
