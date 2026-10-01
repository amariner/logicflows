import { SetMetadata } from '@nestjs/common';

import type { Role } from './roles.ts';

export const PUBLIC_KEY = 'auth:public';
export const ROLE_KEY = 'auth:role';

/** Ruta accesible sin autenticación, como las comprobaciones de salud. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Rol necesario para la ruta. Sin este decorador basta con `viewer`. */
export const RequireRole = (role: Role) => SetMetadata(ROLE_KEY, role);
