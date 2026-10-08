import { describe, expect, it } from 'vitest';

import { hasRole, rolesFromClaims } from './roles.ts';
import type { Principal, Role } from './roles.ts';

const principal = (roles: Role[]): Principal => ({ subject: 'u', name: 'u', roles, expiresAt: 0 });

describe('roles', () => {
  it('lee los roles conocidos de la ruta del token e ignora los demás', () => {
    const claims = { realm_access: { roles: ['offline_access', 'viewer', 'uma_authorization'] } };
    expect(rolesFromClaims(claims, 'realm_access.roles')).toEqual(['viewer']);
  });

  it.each([
    ['sin la ruta', {}],
    ['con un valor que no es una lista', { realm_access: { roles: 'viewer' } }],
    ['con un tramo que no es un objeto', { realm_access: 'viewer' }],
  ])('no da roles %s', (_case, claims) => {
    expect(rolesFromClaims(claims, 'realm_access.roles')).toEqual([]);
  });

  it('admite rutas de un solo tramo', () => {
    expect(rolesFromClaims({ roles: ['admin'] }, 'roles')).toEqual(['admin']);
  });

  it('admin incluye lo que puede hacer viewer, pero no al revés', () => {
    expect(hasRole(principal(['admin']), 'viewer')).toBe(true);
    expect(hasRole(principal(['viewer']), 'viewer')).toBe(true);
    expect(hasRole(principal(['viewer']), 'admin')).toBe(false);
    expect(hasRole(principal([]), 'viewer')).toBe(false);
  });

  it('operator está entre viewer y admin (ADR-0022)', () => {
    expect(hasRole(principal(['operator']), 'viewer')).toBe(true);
    expect(hasRole(principal(['operator']), 'operator')).toBe(true);
    expect(hasRole(principal(['operator']), 'admin')).toBe(false);
    expect(hasRole(principal(['viewer']), 'operator')).toBe(false);
    expect(hasRole(principal(['admin']), 'operator')).toBe(true);
  });
});
