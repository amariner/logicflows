import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { provideVisorAuth } from '../app/core/auth/auth';
import { AppConfigService, parseAppConfig } from '../app/core/config/app-config';
import { provideVisorServiceWorker } from '../app/core/pwa/app-update';
import { WEB_SOCKET_FACTORY } from '../app/core/realtime/realtime.service';
import { FakeWebSocket } from './fake-web-socket';

export const TEST_AUTH = {
  issuer: 'http://idp.test/realms/logicflows',
  clientId: 'logicflows-visor',
};

/**
 * Proveedores comunes de las pruebas: Ionic, configuración, HTTP simulado y
 * WebSocket falso. Con `auth`, la configuración incluye un proveedor de identidad.
 */
export function testProviders(
  options: { auth?: boolean } = {},
): (Provider | EnvironmentProviders)[] {
  const config = new AppConfigService();
  config.set(
    parseAppConfig({
      apiUrl: 'http://api.test',
      ...(options.auth === true ? { auth: TEST_AUTH } : {}),
    }),
  );
  return [
    provideIonicAngular({ mode: 'md' }),
    provideRouter([]),
    provideHttpClient(),
    provideHttpClientTesting(),
    { provide: AppConfigService, useValue: config },
    provideVisorAuth(),
    provideVisorServiceWorker(false),
    {
      provide: WEB_SOCKET_FACTORY,
      useValue: (url: string) => new FakeWebSocket(url) as unknown as WebSocket,
    },
  ];
}
