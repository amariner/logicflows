import { Injectable, inject, signal } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { SwUpdate, provideServiceWorker } from '@angular/service-worker';
import type { VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Service worker del visor instalable (LF-55). Solo guarda la aplicación,
 * nunca datos de planta ni `config.json`: sin conexión no hay nada que
 * mostrar como si fuera actual. Se registra cuando la aplicación está
 * estable para no competir con la carga inicial.
 */
export function provideVisorServiceWorker(enabled: boolean): EnvironmentProviders {
  return provideServiceWorker('ngsw-worker.js', {
    enabled,
    registrationStrategy: 'registerWhenStable:30000',
  });
}

/** Avisa de que hay una versión nueva del visor; se activa al recargar. */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  readonly #updates = inject(SwUpdate);
  readonly #available = signal(false);

  /** Hay una versión nueva descargada que se activará al recargar. */
  readonly available = this.#available.asReadonly();

  constructor() {
    if (!this.#updates.isEnabled) {
      return;
    }
    this.#updates.versionUpdates
      .pipe(
        filter((event: VersionEvent): event is VersionReadyEvent => event.type === 'VERSION_READY'),
      )
      .subscribe(() => {
        this.#available.set(true);
      });
  }

  reload(): void {
    document.location.reload();
  }
}
