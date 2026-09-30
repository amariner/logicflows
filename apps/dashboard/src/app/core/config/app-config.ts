import { Injectable, inject, provideAppInitializer } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { REALTIME_PATH } from '@logicflows/contract';

/** Configuración del visor que depende del entorno de despliegue. */
export interface AppConfig {
  /** URL base de la API REST. */
  readonly apiUrl: string;
  /** URL del canal de tiempo real (ADR-0006), derivada de la API. */
  readonly realtimeUrl: string;
}

/**
 * Valida el contenido de `config.json`. La configuración se lee al arrancar y
 * no al compilar, para que la misma build sirva en todos los entornos.
 */
export function parseAppConfig(value: unknown): AppConfig {
  if (typeof value !== 'object' || value === null || !('apiUrl' in value)) {
    throw new Error('config.json no válido: falta apiUrl');
  }
  const { apiUrl } = value;
  if (typeof apiUrl !== 'string' || !URL.canParse(apiUrl)) {
    throw new Error('config.json no válido: apiUrl no es una URL');
  }
  const api = new URL(apiUrl);
  if (api.protocol !== 'http:' && api.protocol !== 'https:') {
    throw new Error('config.json no válido: apiUrl debe usar http o https');
  }
  const realtime = new URL(REALTIME_PATH, api);
  realtime.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
  return { apiUrl: api.origin, realtimeUrl: realtime.toString() };
}

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  #config: AppConfig | undefined;

  get config(): AppConfig {
    if (this.#config === undefined) {
      throw new Error('La configuración del visor todavía no se ha cargado');
    }
    return this.#config;
  }

  set(config: AppConfig): void {
    this.#config = config;
  }
}

/** Carga `config.json` antes de arrancar la aplicación. */
export function provideAppConfig(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const service = inject(AppConfigService);
    const response = await fetch('config.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`No se pudo cargar config.json (${String(response.status)})`);
    }
    service.set(parseAppConfig(await response.json()));
  });
}
