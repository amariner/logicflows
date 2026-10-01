import { RenderMode } from '@angular/ssr';
import type { ServerRoute } from '@angular/ssr';

// Spike LF-56: se renderiza en el servidor en cada petición.
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }];
