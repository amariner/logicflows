import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
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
    // Visor instalable: solo en la build de producción (LF-55).
    provideVisorServiceWorker(!isDevMode()),
  ],
}).catch((error: unknown) => {
  console.error(error);
});
