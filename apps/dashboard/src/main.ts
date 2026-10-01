import { provideHttpClient, withInterceptors } from '@angular/common/http';
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
  ],
}).catch((error: unknown) => {
  console.error(error);
});
