import type { Provider } from '@angular/core';
import { provideIonicAngular } from '@ionic/angular';

import { AppConfigService, parseAppConfig } from '../app/core/config/app-config';
import { WEB_SOCKET_FACTORY } from '../app/core/realtime/realtime.service';
import { FakeWebSocket } from './fake-web-socket';

/** Proveedores comunes de las pruebas: Ionic, configuración y WebSocket falso. */
export function testProviders(): (Provider | ReturnType<typeof provideIonicAngular>)[] {
  const config = new AppConfigService();
  config.set(parseAppConfig({ apiUrl: 'http://api.test' }));
  return [
    provideIonicAngular({ mode: 'md' }),
    { provide: AppConfigService, useValue: config },
    {
      provide: WEB_SOCKET_FACTORY,
      useValue: (url: string) => new FakeWebSocket(url) as unknown as WebSocket,
    },
  ];
}
