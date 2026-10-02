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

En desarrollo, cambiar el *realm* desde la consola no modifica este fichero: los cambios que deban reproducirse se hacen aquí y se aplican con `pnpm infra:reset`. Este reinicio es del entorno local; no se usa para resolver problemas de acceso en producción.

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

## Imagen de las previsualizaciones

La etapa `identity-preview` es la imagen de producción con un único usuario: `prueba-e2e`, solo con `viewer` y con el perfil completo ([ADR-0012](../../docs/adr/0012-previsualizaciones-por-pull-request.md)). La genera `realm-produccion.mjs --previsualizacion`. La contraseña se toma al importar de `LOGICFLOWS_E2E_PASSWORD`, que en las previsualizaciones recibe el secreto `E2E_PASSWORD`. Sin esa variable la imagen no arranca: Keycloak guardaría como contraseña el texto literal `${LOGICFLOWS_E2E_PASSWORD}`, que es público.

Solo se publica con las etiquetas `pr-*` de las previsualizaciones y nunca se despliega en producción. Prueba (también en la CI):

```sh
docker build --target identity-preview -t logicflows-identity:preview .
infra/keycloak/comprobar-previsualizacion.sh
```

## Alta y primer acceso en producción (LF-48)

La consola se abre en la dirección pública de `identity`, añadiendo `/admin/`. Las cuentas se crean en el realm correspondiente:

| Realm | Cuenta | Permisos |
|---|---|---|
| `master` | Administrador de Keycloak | Administra el proveedor de identidad |
| `logicflows` | Usuario del visor | `viewer` para consultar; `admin` para administrar la aplicación, con `viewer` incluido |

El rol `admin` de `logicflows` no concede administración de Keycloak. Una cuenta creada en `master` no sirve para entrar en el visor.

### Crear un usuario del visor

1. Entrar en la consola con un administrador. Abrir **Manage realms → logicflows** y comprobar que **Current realm** muestra **LogicFlows**.
2. Abrir **Users** y comprobar si la cuenta ya existe. Si existe, continuar sobre ella; si no, pulsar **Create new user**.
3. Completar **Username**, **Email**, **First name** y **Last name**, y pulsar **Create**. Usar el email indicado por su titular; **Email verified** solo debe marcarse cuando se haya verificado.
4. En **Credentials → Set password**, introducir y confirmar la contraseña. Para una cuenta personal cuya contraseña definitiva está estableciendo su titular, desactivar **Temporary** y guardar. Si se entrega una contraseña provisional a otra persona, mantener **Temporary** para exigir el cambio al entrar.
5. En **Role mapping → Assign role → Realm roles**, seleccionar el permiso acordado (`viewer` o `admin`) y pulsar **Assign**. Si se asigna `admin`, desmarcar **Hide inherited roles** para comprobar que `viewer` aparece con **Inherited: True**.
6. Abrir la dirección base del visor e iniciar sesión con la cuenta de `logicflows`.
7. Si aparece **Actualiza la información de tu cuenta**, completar los campos obligatorios y pulsar **Enviar**. En el primer acceso comprobado en producción, la falta de email activó este paso (`VERIFY_PROFILE`) después de aceptar la contraseña.
8. Verificar que el navegador vuelve a `/cells`, muestra la sesión del usuario, la célula y sus datos. Comprobar también **En directo** y que los contadores se actualizan con la simulación en marcha.

La comprobación de salud de la API no sustituye esta prueba: una API sana no demuestra que un usuario pueda autenticarse y consultar los datos. Tampoco basta con que Keycloak acepte la contraseña si quedan acciones de perfil pendientes.

### Usuario de la prueba de producción (LF-57)

El flujo **Prueba de producción** inicia sesión en el visor después de cada despliegue con una cuenta propia, solo de lectura. Es una cuenta técnica: no se comparte ni se usa para nada más.

1. En el realm `logicflows`, crear el usuario `prueba-e2e` siguiendo [Crear un usuario del visor](#crear-un-usuario-del-visor), con estas particularidades:
   - completar **Email**, **First name** y **Last name**. Si falta algún campo obligatorio, Keycloak pide completar el perfil en el primer acceso y la prueba falla;
   - generar la contraseña con `openssl rand -base64 24` y guardarla con **Temporary** desactivado;
   - asignar **solo** el rol `viewer`.
2. Iniciar sesión una vez en el visor con esa cuenta para comprobar que llega a `/cells` sin pasos pendientes.
3. Guardar las credenciales en GitHub sin que aparezcan en pantalla ni en el historial: `gh secret set E2E_USERNAME --repo amariner/logicflows` y `gh secret set E2E_PASSWORD --repo amariner/logicflows`. Cada orden pide el valor.
4. Lanzar el flujo a mano para comprobarlo: `gh workflow run prueba-produccion.yml --repo amariner/logicflows`.

La prueba comprueba en cada ejecución que el token del usuario tiene `viewer` y no `admin`. Si alguien le asigna `admin`, la prueba falla.

Para rotar la contraseña: fijar una nueva en **Credentials** y actualizar `E2E_PASSWORD`.

### Si caduca el intento de inicio de sesión

Ante **«Ha tardado demasiado en identificarse. Inicie de nuevo la identificación.»**, volver a abrir la dirección base del visor e iniciar sesión otra vez. Si vuelve a pedir completar el perfil, rellenar los campos y enviar el formulario.

Caduca el intento de identificación, no la cuenta ni sus roles o contraseña. No hace falta crear otro usuario, restablecer la contraseña ni reiniciar los servicios. No reutilizar como enlace de entrada la URL intermedia de Keycloak: contiene parámetros temporales del flujo. No guardar esas URL, contraseñas ni tokens en documentación o incidencias.

### Habilitar la app Android en producción (LF-68)

La app Android inicia sesión en el navegador del sistema y vuelve por su esquema propio, `io.github.amariner.logicflows:/callback` (RFC 8252). Su vista web tiene el origen `https://localhost`. `realm-produccion.mjs` ya incluye estos valores, pero el realm de producción existe desde LF-48 y `--import-realm` no modifica un realm existente. Por eso, una sola vez, hay que hacer dos cambios a mano:

1. **Keycloak.** En la consola, realm `logicflows`, abrir **Clients → logicflows-visor → Settings** y añadir, sin quitar las del visor web:
   - en **Valid redirect URIs**: `io.github.amariner.logicflows:/*`;
   - en **Valid post logout redirect URIs**: `io.github.amariner.logicflows:/*`;
   - en **Web origins**: `https://localhost`.

   Pulsar **Save**.
2. **API.** Añadir el origen de la app a `CORS_ORIGINS` del servicio `api`. Cambiar la variable redespliega la API; el tiempo real se corta unos segundos y el visor se reconecta solo:

   ```sh
   railway variables -s api -e production --set "CORS_ORIGINS=https://dashboard-production-6f89.up.railway.app,https://localhost"
   ```
3. **Comprobar** con el APK de depuración de cualquier PR (artefacto `logicflows-debug-apk`):
   - el inicio de sesión se abre en el navegador del sistema;
   - al terminar, vuelve a la app;
   - la app muestra la célula **En directo**.

   Cerrar sesión debe devolver a la app y pedir otra vez el inicio de sesión.

Permitir `https://localhost` en la API no expone nada nuevo: la API exige un token en cada petición y no usa cookies. Una página que se sirva en `https://localhost` en el ordenador de alguien no tiene ese token.

### Sustituir el administrador temporal

El alta del usuario del visor no sustituye al administrador temporal de `master`. Para completar la administración permanente:

1. En `master`, crear una cuenta permanente con un nombre que permita distinguirla de la cuenta del visor.
2. Establecer su contraseña, asignar el rol de realm `admin` de `master` y añadir la acción requerida **Configure OTP**.
3. Probar esa cuenta en una sesión separada, completar el OTP y comprobar que puede administrar los realms. Mantener la sesión temporal hasta terminar esta verificación.
4. Desde la sesión permanente ya comprobada, eliminar la cuenta temporal. Después, retirar de `identity` las variables `KC_BOOTSTRAP_ADMIN_USERNAME` y `KC_BOOTSTRAP_ADMIN_PASSWORD`, coordinando el redespliegue que provoque ese cambio.

La recuperación si se pierde el acceso administrativo está en [Particularidades de Railway](../../docs/despliegue.md#particularidades-de-railway). Las contraseñas y los secretos de OTP se conservan fuera del repositorio.
