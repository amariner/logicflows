# Keycloak

Proveedor de identidad OpenID Connect de LogicFlows ([ADR-0009](../../docs/adr/0009-autenticacion-y-autorizacion.md)). Docker Compose lo arranca en modo desarrollo e importa el *realm* `logicflows` de [`realm-logicflows.json`](realm-logicflows.json):

- Roles `viewer` (consulta) y `admin` (incluye `viewer`).
- Cliente público `logicflows-visor` con Authorization Code y PKCE (S256). Sus tokens incluyen la audiencia `logicflows-api`.
- Tokens de acceso de 5 minutos y tokens de refresco de un solo uso.

| Usuario | Contraseña | Rol |
|---|---|---|
| `operario` | `operario-local` | `viewer` |
| `administrador` | `administrador-local` | `admin` |

Estos usuarios y contraseñas son **solo para desarrollo, pruebas y previsualizaciones**. Producción importa el *realm* sin usuarios y los da de alta el administrador de cada planta.

La consola de administración está en `http://localhost:8180/admin`, con el usuario y la contraseña de `KEYCLOAK_ADMIN_USERNAME` y `KEYCLOAK_ADMIN_PASSWORD` en `.env`.

Cambiar el *realm* desde la consola no modifica este fichero: los cambios que deban perdurar se hacen aquí y se aplican con `pnpm infra:reset`.
