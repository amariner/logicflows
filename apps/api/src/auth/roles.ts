/** Roles de la plataforma (ADR-0009, ADR-0022), de menos a más permisos. */
export const ROLES = ['viewer', 'operator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Quien hace la petición, según su token de acceso. */
export interface Principal {
  readonly subject: string;
  /**
   * Nombre de usuario para mostrar y auditar (`preferred_username`), o el
   * sujeto si el token no lo trae.
   */
  readonly name: string;
  readonly roles: readonly Role[];
  /** Caducidad del token de acceso, en milisegundos desde la época. */
  readonly expiresAt: number;
}

/**
 * Cada rol incluye los anteriores: `operator` puede todo lo de `viewer`, y
 * `admin`, todo lo de `operator`. Keycloak ya los declara compuestos, pero la
 * API no depende de ello.
 */
export function hasRole(principal: Principal, required: Role): boolean {
  const level = ROLES.indexOf(required);
  return principal.roles.some((role) => ROLES.indexOf(role) >= level);
}

/** Lee los roles conocidos de una ruta del token como `realm_access.roles`. */
export function rolesFromClaims(claims: Record<string, unknown>, path: string): Role[] {
  let value: unknown = claims;
  for (const key of path.split('.')) {
    value =
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)[key]
        : undefined;
  }
  return Array.isArray(value) ? ROLES.filter((role) => (value as unknown[]).includes(role)) : [];
}
