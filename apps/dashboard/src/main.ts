import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { Capacitor } from '@capacitor/core';
import {
  PreloadAllModules,
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { authInterceptor } from 'angular-auth-oidc-client';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideVisorAuth } from './app/core/auth/auth';
import { provideAppConfig } from './app/core/config/app-config';
import { provideVisorServiceWorker } from './app/core/pwa/app-update';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // Mismo aspecto en todas las plataformas (ADR-0002).
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    // El token solo se añade a las peticiones a la API (secureRoutes).
    provideHttpClient(withInterceptors([authInterceptor()])),
    provideAppConfig(),
    provideVisorAuth(),
    // Visor instalable: solo en la build de producción (LF-55). En la app
    // Android sobra: la aplicación ya va dentro del APK, y un service worker
    // podría servir una versión anterior tras actualizarla (LF-70).
    provideVisorServiceWorker(!isDevMode() && !Capacitor.isNativePlatform()),
  ],
}).catch((error: unknown) => {
  console.error(error);
});
