# Despliegue en Railway

LogicFlows se despliega en [Railway](https://railway.com) ([ADR-0008](adr/0008-plataforma-de-despliegue.md)). Este documento describe:

- el entorno de producción, su configuración y sus secretos (LF-48);
- cómo se despliega una versión y cómo se vuelve atrás (LF-49);
- las previsualizaciones por pull request (LF-53).

Cómo saber si producción funciona (registros, métricas, panel y alertas) está en [Observabilidad](../infra/grafana/README.md) (LF-54).

La infraestructura está descrita como código en [`.railway/railway.ts`](../.railway/railway.ts) ([ADR-0011](adr/0011-infraestructura-como-codigo.md)).

## Servicios

Proyecto `logicflows`, entorno `production`, todos los servicios en la región **europe-west4 (Ámsterdam)**: latencia baja desde España y datos dentro de la UE.

| Servicio | Origen | Acceso |
|---|---|---|
| `Postgres` | Plantilla PostgreSQL de Railway, con volumen | Solo red privada |
| `broker` | `ghcr.io/amariner/logicflows-broker`, con el volumen `broker-data` en `/mosquitto/data` | Red privada (`broker.railway.internal:1883`) para la API y el simulador; público por `wss://` (puerto 9001) para las células |
| `identity` | `ghcr.io/amariner/logicflows-identity` | Público, puerto 8080 |
| `api` | `ghcr.io/amariner/logicflows-api` | Público, puerto 3000 |
| `simulator` | `ghcr.io/amariner/logicflows-simulator` | Sin puertos |
| `dashboard` | `ghcr.io/amariner/logicflows-dashboard` | Público, puerto 8080 |

Los servicios usan una etiqueta de versión (`vX.Y.Z`) o de commit (`sha-<commit>`), nunca `main`: una etiqueta inmutable garantiza que se ejecuta lo que se probó. Los dominios son los gratuitos de Railway (`*.up.railway.app`), con HTTPS y `wss://`.

**Las células de planta** se conectan a `wss://broker-production-c580.up.railway.app`. Railway termina TLS y el broker exige usuario y contraseña: rechaza las conexiones anónimas y las credenciales incorrectas (comprobado el 1 de octubre de 2026). La célula de demostración (`simulator`) usa la red privada.

## Infraestructura como código

`.railway/railway.ts` describe los servicios, las imágenes, las réplicas, los dominios, los volúmenes, las comprobaciones de salud y las variables. Los secretos no están en el fichero: `preserve()` conserva el valor sellado que ya tiene cada variable en Railway.

- **En cada pull request** que cambie `.railway/`, el flujo `Railway plan` publica en la PR los cambios que haría en producción y fija ese plan.
- **Al fusionar,** `Railway apply` aplica exactamente el plan revisado. Si producción cambió entretanto, falla y hay que volver a planificar.
- **En local,** `pnpm railway:plan` compara el fichero con producción. Necesita la CLI de Railway con sesión iniciada y la carpeta enlazada al proyecto (`railway link -p logicflows -e production`). Si muestra cambios que nadie ha propuesto, alguien modificó producción a mano: se lleva el cambio al fichero o se deshace.

Los flujos necesitan el secreto de repositorio `RAILWAY_TOKEN`: un token de proyecto de Railway limitado al entorno `production`. Lo crea y lo rota el titular de la cuenta:

1. En Railway, ir a *Project Settings → Tokens* del proyecto `logicflows` y crear un token para `production`.
2. Guardarlo en GitHub con `gh secret set RAILWAY_TOKEN --repo amariner/logicflows`, que pide el valor sin mostrarlo.

Sin el token, los dos flujos fallan con un aviso. Las PR desde forks no lo reciben y no calculan el plan.

Para esperar a que terminen los despliegues, `Railway apply` usa también `RAILWAY_API_TOKEN`, el token de cuenta de las [previsualizaciones](#previsualizaciones-por-pull-request), con el mismo método que ya funciona en ellas.

**Comprobaciones de salud.** Railway no envía tráfico a un despliegue nuevo hasta que su comprobación responde; si no lo hace a tiempo, el anterior sigue atendiendo.

| Servicio | Comprobación | Espera máxima |
|---|---|---|
| `api` | `/health/ready`: PostgreSQL y broker conectados | 120 s |
| `identity` | `/realms/logicflows/.well-known/openid-configuration`: realm cargado | 300 s |
| `dashboard` | `/config.json` | Por defecto |

La API aplica las migraciones pendientes antes de empezar a escuchar ([ADR-0007](adr/0007-acceso-a-datos-y-migraciones.md)): una versión nueva no recibe tráfico hasta tener el esquema al día.

## Desplegar una versión

1. **Etiquetar.** Con todas las comprobaciones en verde en `main`, se etiqueta el commit (`git tag v0.2.0 && git push origin v0.2.0`). El flujo `Imágenes` asigna esa versión a las imágenes ya publicadas del commit, sin recompilar. Si el commit no tiene imágenes, falla. El flujo `App Android` compila y firma el APK de la versión y lo adjunta a su release de GitHub; si la release no existe, la crea con las notas de `CHANGELOG.md` ([App Android](../apps/dashboard/android/README.md#versiones-publicadas)).
2. **Proponer.** En una pull request se cambia `VERSION` en `.railway/railway.ts` a la etiqueta nueva. El plan de la PR debe mostrar solo el cambio de imagen de los cinco servicios.
3. **Fusionar.** `Railway apply` despliega los cinco servicios y cada uno pasa su comprobación de salud antes de recibir tráfico. El flujo no termina hasta que todos los despliegues nuevos están en `SUCCESS`, con [`infra/railway/esperar-despliegues.sh`](../infra/railway/esperar-despliegues.sh). Si alguno falla, el flujo falla y la prueba no se ejecuta (LF-73).
4. **Comprobar.** El flujo `Prueba de producción` se ejecuta solo al terminar el despliegue. Si falla, se vuelve atrás.

**Prueba tras el despliegue (LF-57).** Cuando `Railway apply` termina bien, el flujo `Prueba de producción` ejecuta la prueba de extremo a extremo contra el visor de producción:

- inicia sesión con el usuario de solo lectura;
- espera a que llegue una caja nueva de la célula de demostración;
- comprueba que el visor es instalable y que el usuario no tiene el rol `admin`.

Si falla, abre una incidencia en GitHub (o comenta en la que siga abierta) con las trazas y los pasos para volver atrás. También se puede lanzar a mano: `gh workflow run prueba-produccion.yml`. Necesita los secretos `E2E_USERNAME` y `E2E_PASSWORD` ([alta del usuario](../infra/keycloak/README.md#usuario-de-la-prueba-de-producción-lf-57)).

## Volver atrás

Se devuelve `VERSION` a la etiqueta anterior con una pull request (`git revert` del cambio de versión) y se fusiona. Las imágenes anteriores siguen en GHCR, así que no se recompila nada.

**Probado en producción el 1 de octubre de 2026:**

- de `sha-edbfac9` a `sha-656c72d` y vuelta;
- unos dos minutos cada sentido, con los cinco servicios en `SUCCESS` y `/health/ready` en `up`;
- al terminar, `plan` no mostró ninguna diferencia.

**En una urgencia,** si no se puede esperar a la CI, desde la web de Railway se redespliega el despliegue anterior del servicio afectado. Después se refleja en `.railway/railway.ts` con una pull request; si no, el siguiente `apply` lo revertirá.

**Volver atrás no deshace migraciones.** Solo es seguro si el esquema nuevo sigue sirviendo a la versión anterior. Por eso las migraciones son aditivas:

1. Una versión añade columnas o tablas.
2. Una versión posterior, ya sin vuelta atrás a la previa, retira lo que sobra.

Una migración que borre o renombre no puede ir en la misma versión que el código que deja de usarlo.

## Previsualizaciones por pull request

Una pull request de una rama de este repositorio puede tener su propio sistema completo en Railway: el entorno `pr-<número>`, con visor, API, simulador, broker, Keycloak y PostgreSQL ([ADR-0012](adr/0012-previsualizaciones-por-pull-request.md)). **Es bajo demanda:** se pide poniendo la etiqueta `previsualizacion` en la PR (`gh pr edit <número> --add-label previsualizacion`). Conviene pedirla cuando hay algo que ver en marcha o cuando la PR cambia el despliegue (`.railway/`, `Dockerfile`, `infra/`). Lo gestiona el flujo `Previsualización`:

1. **Al poner la etiqueta y en cada commit posterior** publica en GHCR las cinco imágenes de la PR con la etiqueta `pr-<número>-<commit>`. Keycloak usa la variante `identity-preview`, con el usuario de prueba.
2. Ejecuta [`infra/railway/previsualizacion.sh`](../infra/railway/previsualizacion.sh) `desplegar`:
   - crea el entorno vacío si no existe y aplica `.railway/railway.ts`;
   - crea los usuarios de PostgreSQL con `usuarios.sql`, como en producción;
   - espera a que el despliegue nuevo de cada servicio esté sano.
3. Publica las direcciones en un comentario de la PR, que se actualiza en cada commit.
4. Ejecuta la prueba de extremo a extremo contra la previsualización con el usuario `prueba-e2e`.
5. **Al quitar la etiqueta o cerrar la PR**, fusionada o no, borra el entorno con sus volúmenes.

**Probado el 2 de octubre de 2026** con el entorno `pr-9999` y las imágenes de `main`:

- crear desde cero tardó unos 130 segundos y actualizar, unos 125, hasta que los seis servicios estuvieron sanos;
- borrar es asíncrono: el script espera a que el entorno desaparezca;
- Railway solo admite un entorno nuevo cada 30 segundos por espacio de trabajo: el script reintenta;
- producción siguió sin diferencias en el plan durante todas las pruebas.

Las direcciones se derivan del número: `https://logicflows-pr-<número>-dashboard.up.railway.app`, y lo mismo con `api`, `identity` y `broker`.

**Qué no comparte con producción.** El entorno se crea vacío: no copia datos, variables ni secretos. Los volúmenes son instancias propias de cada entorno (comprobado el 2 de octubre de 2026: las de `pr-9999` empezaron vacías). Los secretos son un HMAC del nombre del entorno con una semilla que solo tiene la CI. Son estables entre commits y no se sellan, porque Railway solo permite sellar desde la web.

**Secretos de GitHub que necesita.** Los crea el titular de la cuenta:

| Secreto | Qué es | Cómo se crea |
|---|---|---|
| `RAILWAY_API_TOKEN` | Token de **cuenta** de Railway. Un token de proyecto está limitado a un entorno y no puede crear otros. | En Railway, *Account Settings → Tokens*. Después, `gh secret set RAILWAY_API_TOKEN --repo amariner/logicflows`. |
| `PREVIEW_SECRETS_SEED` | Semilla de los secretos de las previsualizaciones | `openssl rand -hex 32 \| gh secret set PREVIEW_SECRETS_SEED --repo amariner/logicflows` |
| `E2E_PASSWORD` | Contraseña del usuario de solo lectura de la prueba; el mismo secreto que usa la de producción | [Alta del usuario](../infra/keycloak/README.md#usuario-de-la-prueba-de-producción-lf-57) |

El token de cuenta también alcanza producción. Por eso el flujo solo se ejecuta en PR de ramas del propio repositorio y nunca aplica cambios destructivos.

**A mano.** Con la CLI de Railway con sesión iniciada:

```sh
LOGICFLOWS_IMAGE_TAG=pr-12-abc1234 PREVIEW_SECRETS_SEED=... E2E_PASSWORD=... \
  infra/railway/previsualizacion.sh desplegar 12
infra/railway/previsualizacion.sh destruir 12
```

El script deja la carpeta enlazada al entorno de la previsualización. Después hay que volver a producción: `railway link -p logicflows -e production`.

**Coste.** Cada previsualización cuesta unos 0,50 USD al día mientras existe. Quitar la etiqueta la borra sin cerrar la PR. Una PR con la etiqueta y olvidada sigue costando, y si se alcanza el límite de gasto de la cuenta, Railway detiene todo, producción incluida.

## Configuración y secretos

Toda la configuración son variables de entorno del servicio en Railway. Hay tres tipos:

- **Secretos:** se generan al crear el entorno (`openssl rand -hex 24`, o `-hex 32` para el secreto de los tiques) y se **sellan**. Una variable sellada se entrega al servicio, pero nadie puede volver a leerla: ni en la web, ni con la API, ni con la CLI. Railway no copia las variables selladas a los entornos de previsualización ni a los entornos duplicados.
- **Referencias:** valores derivados de otros servicios, como `${{Postgres.RAILWAY_PRIVATE_DOMAIN}}` o `${{dashboard.RAILWAY_PUBLIC_DOMAIN}}`. No se copian a mano y se actualizan solos.
- **Valores fijos:** el resto de la configuración, como el nivel de registro o el cliente OpenID Connect.

| Servicio | Secretos (sellados) | Referencias y valores fijos |
|---|---|---|
| `broker` | `MQTT_API_PASSWORD`, `MQTT_SIMULATOR_PASSWORD` | — |
| `identity` | `KC_DB_PASSWORD`, `KC_BOOTSTRAP_ADMIN_PASSWORD` | `KC_HOSTNAME`, `KC_DB_URL`, `KC_DB_USERNAME=keycloak`, `LOGICFLOWS_VISOR_URL`, `KC_BOOTSTRAP_ADMIN_USERNAME` |
| `api` | `DATABASE_URL`, `MQTT_API_PASSWORD`, `REALTIME_TICKET_SECRET`, `METRICS_TOKEN` | `MQTT_URL`, `AUTH_ISSUER`, `CORS_ORIGINS`, `TRUST_PROXY_HOPS=1`, `LOG_LEVEL` |
| `simulator` | `MQTT_SIMULATOR_PASSWORD` | `MQTT_URL`, `SIMULATOR_SITE_ID`, `SIMULATOR_CELL_ID`, `LOG_LEVEL` |
| `dashboard` | — | `API_URL`, `AUTH_ISSUER`, `AUTH_CLIENT_ID` |

`DATABASE_URL` se sella entera porque contiene la contraseña.

`METRICS_TOKEN` (`openssl rand -hex 32`) solo existe en producción: es el token con el que Grafana Cloud recoge `/metrics` ([ADR-0013](adr/0013-observabilidad.md)). Sin la variable, la ruta responde 404. Su puesta en marcha está en [Observabilidad](../infra/grafana/README.md).

Las contraseñas MQTT están en dos servicios: el broker las necesita para autenticar y cada cliente para conectarse. Se guarda una copia sellada en cada uno; no se usan referencias, porque una referencia muestra el valor resuelto a quien pueda leer las variables del servicio que la contiene.

**Cada entorno tiene sus propias credenciales.** Las previsualizaciones (LF-53) generan las suyas, porque Railway no les copia las selladas.

**Una aplicación con configuración incompleta no arranca.** La API y el simulador validan sus variables al arrancar e indican cuál falta o no es válida, por ejemplo `✖ Invalid URL → at CORS_ORIGINS[0]`. El visor (`Falta API_URL`) y el broker (`Falta MQTT_API_PASSWORD`) hacen lo mismo en su script de arranque.

### PostgreSQL: un servidor, dos usuarios

La API y Keycloak comparten el servidor PostgreSQL, pero cada uno tiene su usuario y su base de datos: `logicflows` y `keycloak`. Ninguno puede conectarse a la del otro. Los crea [`infra/postgres/usuarios.sql`](../infra/postgres/usuarios.sql), que es idempotente: crea lo que falte y fija las contraseñas, así que también sirve para rotarlas. La contraseña de administrador de PostgreSQL la gestiona la plantilla de Railway y no se usa fuera de Railway.

### Ejecutar SQL en un entorno

El servidor solo es accesible por la red privada, y `railway ssh` necesita el puerto 22, que algunas redes corporativas bloquean. [`infra/railway/ejecutar-sql.sh`](../infra/railway/ejecutar-sql.sh) hace lo siguiente:

1. Crea un servicio temporal con `psql` dentro de la red privada.
2. Le pasa la contraseña de administrador por referencia, sin que salga de Railway.
3. Ejecuta el script y muestra el resultado.
4. Borra el servicio, con todas las variables que recibió.

```sh
API_PASSWORD=... KEYCLOAK_PASSWORD=... \
  infra/railway/ejecutar-sql.sh production infra/postgres/usuarios.sql API_PASSWORD KEYCLOAK_PASSWORD
```

Necesita la [CLI de Railway](https://docs.railway.com/cli) con sesión iniciada y `jq`.

## Rotación de credenciales

El [procedimiento de Keycloak](../infra/keycloak/README.md#alta-y-primer-acceso-en-producción-lf-48) describe el alta de usuarios, la comprobación del primer acceso al visor, la recuperación de un intento de identificación caducado y la sustitución del administrador temporal.

Una variable sellada no se puede leer, pero sí sustituir. Para rotar un secreto se genera un valor nuevo, se cambia donde se valida y después donde se usa, y se despliega.

| Credencial | Procedimiento |
|---|---|
| Base de datos de la API o de Keycloak | `ejecutar-sql.sh` con `usuarios.sql` y la contraseña nueva. Después, actualizar `DATABASE_URL` en `api` o `KC_DB_PASSWORD` en `identity`; cambiar la variable despliega el servicio. |
| Contraseñas MQTT | Actualizar la variable en `broker` y en el cliente (`api` o `simulator`) sin desplegar (`--skip-deploys`). Después desplegar `broker` y, a continuación, el cliente. Los clientes reconectan solos. |
| `REALTIME_TICKET_SECRET` | Actualizar la variable en `api`. Los tiques en circulación, de 30 segundos, dejan de ser válidos y el visor pide uno nuevo al reconectar. |
| `METRICS_TOKEN` | Actualizar la variable en `api` y, después, el token de la integración *Metrics Endpoint* en Grafana Cloud. Mientras tanto fallan las recogidas; si pasan más de 5 minutos, salta la alerta «API sin responder». |
| Administrador de Keycloak | Desde la consola de administración de Keycloak. `KC_BOOTSTRAP_ADMIN_*` solo crea el administrador inicial (ver «Particularidades»). |

**Probado en producción el 1 de octubre de 2026** con la contraseña de la base de datos de la API: `/health/ready` siguió en `up` durante el cambio y después del despliegue.

**Límite conocido:** entre el cambio en PostgreSQL y el despliegue de la API pasan unos segundos. En ese intervalo, la versión anterior conserva sus conexiones abiertas, pero no podría abrir otras nuevas. Para rotar sin ese intervalo harían falta dos usuarios alternos. No compensa mientras la rotación sea manual y poco frecuente.

## Particularidades de Railway

- **Las referencias se resuelven al guardar la variable.** Una referencia a un servicio que todavía no existe queda vacía. Si se crean servicios que se referencian entre sí, hay que volver a definir esas variables al final.
- **El realm de Keycloak solo se importa la primera vez** ([ADR-0010](adr/0010-imagenes-de-la-infraestructura.md)). Los cambios posteriores se aplican desde la consola o la API de administración. Vaciar la base de datos para repetir la importación solo es una opción durante la preparación inicial, si no contiene usuarios ni datos que conservar. Con usuarios de producción, no se borra la base de datos para corregir un acceso o un formulario caducado.
- **El administrador inicial de Keycloak solo se crea con el realm `master`.** `KC_BOOTSTRAP_ADMIN_USERNAME` y `KC_BOOTSTRAP_ADMIN_PASSWORD` solo se usan en el primer arranque. Si se definen después, Keycloak las ignora y el inicio de sesión falla con `user_not_found`. Para crear un administrador temporal en un `master` existente, con `identity` detenido (`railway down --service identity`):
  1. Fijar como comando de inicio `/bin/bash -c "/opt/keycloak/bin/kc.sh bootstrap-admin user --username:env KC_BOOTSTRAP_ADMIN_USERNAME --password:env KC_BOOTSTRAP_ADMIN_PASSWORD --optimized; exec /opt/keycloak/bin/kc.sh start --optimized --import-realm"` y desplegar. Railway sustituye el `ENTRYPOINT` de la imagen por el comando de inicio.
  2. Comprobar en el registro `Created temporary admin user`.
  3. Vaciar el comando de inicio (`startCommand: ""`) y volver a desplegar.
- **La región por defecto es `us-west`.** En `.railway/railway.ts` cada servicio declara sus réplicas en Ámsterdam (`europe-west4-drams3a`).
- **Un dominio con nombre aleatorio no se crea desde `.railway/railway.ts`.** Se crea con `railway domain --service <servicio> --port <puerto>` y después se declara en el fichero con el nombre que asignó Railway. Un dominio `*.up.railway.app` con un nombre elegido, como los de las previsualizaciones, sí se crea desde el fichero (comprobado el 2 de octubre de 2026).
- **El montaje de un volumen se declara con la ruta como clave:** `volumeMounts: { '/mosquitto/data': brokerData }`.
- **Sellar una variable solo es posible desde la web**, no con la CLI ni con la API.
- **Aviso de dominio público:** Railway marca las variables que usan `RAILWAY_PUBLIC_DOMAIN` porque el tráfico entre servicios que sale por Internet se factura como salida de red. En `KC_HOSTNAME`, `LOGICFLOWS_VISOR_URL`, `CORS_ORIGINS` y la configuración del visor es lo correcto: es la dirección que ve el navegador. La API descarga por la dirección pública las claves de Keycloak con las que valida los tokens; son pocos kilobytes y se guardan en caché.
