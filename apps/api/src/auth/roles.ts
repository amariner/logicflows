/** Roles de la plataforma (ADR-0009). */
export const ROLES = ['viewer', 'admin'] as const;
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

/** `admin` incluye todo lo que puede hacer `viewer`. */
export function hasRole(principal: Principal, required: Role): boolean {
  return principal.roles.includes(required) || principal.roles.includes('admin');
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
