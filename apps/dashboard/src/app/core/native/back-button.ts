/** Lo que se usa de `Platform` de Ionic; se sustituye en las pruebas. */
export interface BackButtonSource {
  readonly backButton: {
    subscribeWithPriority(priority: number, handler: () => void): unknown;
  };
}

/**
 * Botón atrás de Android en la app (LF-70). Ionic ya retrocede en la
 * navegación; este manejador, con la prioridad más baja, solo actúa cuando no
 * queda adónde volver y cierra la app, como cualquier app de Android.
 */
export function exitOnRootBackButton(
  platform: BackButtonSource,
  canGoBack: () => boolean,
  exitApp: () => Promise<void>,
): void {
  platform.backButton.subscribeWithPriority(-1, () => {
    if (!canGoBack()) {
      void exitApp();
    }
  });
}
