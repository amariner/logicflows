# Despliegue en Railway

LogicFlows se despliega en [Railway](https://railway.com) ([ADR-0008](adr/0008-plataforma-de-despliegue.md)). Este documento describe el entorno de producción, su configuración y sus secretos, y cómo operarlos (LF-48). El despliegue de versiones y la vuelta atrás llegan con LF-49.

## Servicios

Proyecto `logicflows`, entorno `production`, todos los servicios en la región **europe-west4 (Ámsterdam)**: latencia baja desde España y datos dentro de la UE.

| Servicio | Origen | Acceso |
|---|---|---|
| `Postgres` | Plantilla PostgreSQL de Railway, con volumen | Solo red privada |
| `broker` | `ghcr.io/amariner/logicflows-broker` | Solo red privada (`broker.railway.internal:1883`) |
| `identity` | `ghcr.io/amariner/logicflows-identity` | Público, puerto 8080 |
| `api` | `ghcr.io/amariner/logicflows-api` | Público, puerto 3000 |
| `simulator` | `ghcr.io/amariner/logicflows-simulator` | Sin puertos |
| `dashboard` | `ghcr.io/amariner/logicflows-dashboard` | Público, puerto 8080 |

Los servicios usan imágenes con etiqueta de commit (`sha-<commit>`), nunca `main`: una etiqueta inmutable garantiza que se ejecuta lo que se probó. Los dominios son los gratuitos de Railway (`*.up.railway.app`) con HTTPS.

## Configuración y secretos

Toda la configuración son variables de entorno del servicio en Railway. Hay tres tipos:

- **Secretos:** se generan al crear el entorno (`openssl rand -hex 24`, o `-hex 32` para el secreto de los tiques) y se **sellan**. Una variable sellada se entrega al servicio, pero nadie puede volver a leerla: ni en la web, ni con la API, ni con la CLI. Railway no copia las variables selladas a los entornos de previsualización ni a los entornos duplicados.
- **Referencias:** valores derivados de otros servicios, como `${{Postgres.RAILWAY_PRIVATE_DOMAIN}}` o `${{dashboard.RAILWAY_PUBLIC_DOMAIN}}`. No se copian a mano y se actualizan solos.
- **Valores fijos:** el resto de la configuración, como el nivel de registro o el cliente OpenID Connect.

| Servicio | Secretos (sellados) | Referencias y valores fijos |
|---|---|---|
| `broker` | `MQTT_API_PASSWORD`, `MQTT_SIMULATOR_PASSWORD` | — |
| `identity` | `KC_DB_PASSWORD`, `KC_BOOTSTRAP_ADMIN_PASSWORD` | `KC_HOSTNAME`, `KC_DB_URL`, `KC_DB_USERNAME=keycloak`, `LOGICFLOWS_VISOR_URL`, `KC_BOOTSTRAP_ADMIN_USERNAME` |
| `api` | `DATABASE_URL`, `MQTT_API_PASSWORD`, `REALTIME_TICKET_SECRET` | `MQTT_URL`, `AUTH_ISSUER`, `CORS_ORIGINS`, `TRUST_PROXY_HOPS=1`, `LOG_LEVEL` |
| `simulator` | `MQTT_SIMULATOR_PASSWORD` | `MQTT_URL`, `SIMULATOR_SITE_ID`, `SIMULATOR_CELL_ID`, `LOG_LEVEL` |
| `dashboard` | — | `API_URL`, `AUTH_ISSUER`, `AUTH_CLIENT_ID` |

`DATABASE_URL` se sella entera porque contiene la contraseña.

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

Una variable sellada no se puede leer, pero sí sustituir. Para rotar un secreto se genera un valor nuevo, se cambia donde se valida y después donde se usa, y se despliega.

| Credencial | Procedimiento |
|---|---|
| Base de datos de la API o de Keycloak | `ejecutar-sql.sh` con `usuarios.sql` y la contraseña nueva. Después, actualizar `DATABASE_URL` en `api` o `KC_DB_PASSWORD` en `identity`; cambiar la variable despliega el servicio. |
| Contraseñas MQTT | Actualizar la variable en `broker` y en el cliente (`api` o `simulator`) sin desplegar (`--skip-deploys`). Después desplegar `broker` y, a continuación, el cliente. Los clientes reconectan solos. |
| `REALTIME_TICKET_SECRET` | Actualizar la variable en `api`. Los tiques en circulación, de 30 segundos, dejan de ser válidos y el visor pide uno nuevo al reconectar. |
| Administrador de Keycloak | Desde la consola de administración de Keycloak. `KC_BOOTSTRAP_ADMIN_*` solo crea el administrador inicial. |

**Probado en producción el 1 de octubre de 2026** con la contraseña de la base de datos de la API: `/health/ready` siguió en `up` durante el cambio y después del despliegue.

**Límite conocido:** entre el cambio en PostgreSQL y el despliegue de la API pasan unos segundos. En ese intervalo, la versión anterior conserva sus conexiones abiertas, pero no podría abrir otras nuevas. Para rotar sin ese intervalo harían falta dos usuarios alternos. No compensa mientras la rotación sea manual y poco frecuente.

## Particularidades de Railway

- **Las referencias se resuelven al guardar la variable.** Una referencia a un servicio que todavía no existe queda vacía. Si se crean servicios que se referencian entre sí, hay que volver a definir esas variables al final.
- **El realm de Keycloak solo se importa la primera vez** ([ADR-0010](adr/0010-imagenes-de-la-infraestructura.md)). Si `identity` arranca con una configuración incorrecta, hay que vaciar su base de datos y volver a desplegar. Mientras no tenga usuarios, basta con ejecutar `DROP DATABASE keycloak WITH (FORCE)` y después `usuarios.sql`.
- **La región por defecto es `us-west`.** Cada servicio nuevo se mueve a Ámsterdam: `railway service scale --service <servicio> europe-west4-drams3a=1 sfo=0`.
- **Sellar una variable solo es posible desde la web**, no con la CLI ni con la API.
