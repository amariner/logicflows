import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { provideIonicAngular } from '@ionic/angular';

import { AppConfigService, parseAppConfig } from '../app/core/config/app-config';
import { WEB_SOCKET_FACTORY } from '../app/core/realtime/realtime.service';
import { FakeWebSocket } from './fake-web-socket';

/** Proveedores comunes de las pruebas: Ionic, configuración, HTTP simulado y WebSocket falso. */
export function testProviders(): (Provider | EnvironmentProviders)[] {
  const config = new AppConfigService();
  config.set(parseAppConfig({ apiUrl: 'http://api.test' }));
  return [
    provideIonicAngular({ mode: 'md' }),
    provideHttpClient(),
    provideHttpClientTesting(),
    { provide: AppConfigService, useValue: config },
    {
      provide: WEB_SOCKET_FACTORY,
      useValue: (url: string) => new FakeWebSocket(url) as unknown as WebSocket,
    },
  ];
}
