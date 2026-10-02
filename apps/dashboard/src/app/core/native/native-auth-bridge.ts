import { InjectionToken } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

/**
 * Esquema propio de la app Android para volver del inicio de sesión
 * (RFC 8252): es el identificador de la app, que no cambia (ADR-0014).
 */
export const APP_URL_SCHEME = 'io.github.amariner.logicflows';

/**
 * Lo que el inicio de sesión necesita de la app nativa (LF-68). En una app,
 * el proveedor no puede volver a una URL del visor: se abre en el navegador
 * del sistema, nunca en la vista web, y vuelve a la app por su esquema.
 */
export interface NativeAuthBridge {
  /** El visor se ejecuta como app nativa (Capacitor), no en un navegador. */
  readonly native: boolean;
  openInSystemBrowser(url: string): Promise<void>;
  closeSystemBrowser(): Promise<void>;
  /** La app se abre con una URL de su esquema: la vuelta del proveedor. */
  onAppUrlOpen(handler: (url: string) => void): void;
  /** Se cerró el navegador del sistema, con o sin terminar el inicio de sesión. */
  onSystemBrowserClosed(handler: () => void): void;
  /**
   * URL con la que se abrió la app. Si Android la cerró mientras el inicio de
   * sesión estaba en el navegador, la vuelta de Keycloak llega por aquí y no
   * por `onAppUrlOpen` (LF-75).
   */
  launchUrl(): Promise<string | undefined>;
}

export const NATIVE_AUTH_BRIDGE = new InjectionToken<NativeAuthBridge>('NATIVE_AUTH_BRIDGE', {
  providedIn: 'root',
  factory: (): NativeAuthBridge => ({
    native: Capacitor.isNativePlatform(),
    openInSystemBrowser: (url) => Browser.open({ url }),
    // En Android la pestaña se cierra sola al volver a la app.
    closeSystemBrowser: () => Browser.close().catch(() => undefined),
    onAppUrlOpen: (handler) => {
      void App.addListener('appUrlOpen', (event) => {
        handler(event.url);
      });
    },
    onSystemBrowserClosed: (handler) => {
      void Browser.addListener('browserFinished', handler);
    },
    launchUrl: async () => (await App.getLaunchUrl())?.url,
  }),
});
