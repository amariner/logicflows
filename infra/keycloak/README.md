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

## Imagen de producción

La etapa `identity` del [`Dockerfile`](../../Dockerfile) empaqueta Keycloak compilado para producción ([ADR-0010](../../docs/adr/0010-imagenes-de-la-infraestructura.md)). Su *realm* se genera a partir de este con [`realm-produccion.mjs`](realm-produccion.mjs): sin usuarios y con las direcciones del visor tomadas de `LOGICFLOWS_VISOR_URL`. La construcción falla si el resultado contiene usuarios o credenciales.

| Variable | Valor |
|---|---|
| `KC_HOSTNAME` | Dirección pública de Keycloak, por ejemplo `https://identidad.example.com`. Es el emisor de los tokens (`AUTH_ISSUER` de la API, añadiendo `/realms/logicflows`) |
| `KC_DB_URL` | `jdbc:postgresql://<servidor>:5432/<base de datos>`, una base de datos propia de Keycloak |
| `KC_DB_USERNAME` · `KC_DB_PASSWORD` | Credenciales de esa base de datos |
| `LOGICFLOWS_VISOR_URL` | Dirección pública del visor, sin barra final |
| `KC_BOOTSTRAP_ADMIN_USERNAME` · `KC_BOOTSTRAP_ADMIN_PASSWORD` | Administrador inicial; solo se usa en el primer arranque |

Keycloak atiende HTTP en el puerto 8080 detrás del proxy de la plataforma, que termina TLS, y publica la salud en `:9000/health/ready`. El *realm* solo se importa en el primer arranque: después, los cambios se aplican con la consola o la API de administración.

Prueba de la imagen contra un PostgreSQL efímero (la ejecuta la CI en cada pull request):

```sh
docker build --target identity -t logicflows-identity:local .
infra/keycloak/comprobar-produccion.sh
```
