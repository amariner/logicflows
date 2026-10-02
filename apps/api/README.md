# API

Única puerta de entrada de los datos de planta: se suscribe a la telemetría MQTT, la valida contra el contrato, la persiste en PostgreSQL y la expone por REST y WebSocket.

NestJS 12 sobre Node.js, con módulos ES y TypeScript estricto.

## Estado actual

Esqueleto operativo (LF-23), ingesta de telemetría (LF-26), canal de tiempo real (LF-27), persistencia en PostgreSQL (LF-32), API REST (LF-33), autenticación (LF-50) y métricas (LF-54).

| Ruta | Contenido |
|---|---|
| `GET /health/live` | Vivacidad: el proceso responde. Si falla, el orquestador reinicia la API. |
| `GET /health/ready` | Disponibilidad: la API está conectada al broker MQTT y a PostgreSQL. Responde `503` si falta alguno. |
| `GET /metrics` | Métricas en formato Prometheus para Grafana Cloud ([ADR-0013](../../docs/adr/0013-observabilidad.md)). Exige `METRICS_TOKEN`; sin la variable responde `404`. |
| `GET /api/v1/cells` | Estado actual de todas las células. |
| `GET /api/v1/sites/{siteId}/cells/{cellId}` | Estado actual de una célula. |
| `GET /api/v1/sites/{siteId}/cells/{cellId}/production?from&to` | Cajas y pallets producidos en un periodo. |
| `POST /api/v1/realtime/tickets` | Tique de un solo uso para abrir el canal de tiempo real. |
| `POST /api/v1/push/devices` | Registra el token de FCM del dispositivo para recibir avisos de alarmas ([ADR-0015](../../docs/adr/0015-avisos-de-alarmas-en-el-movil.md)). |
| `DELETE /api/v1/push/devices` | Da de baja un dispositivo del usuario. |
| `GET /docs` | Documentación OpenAPI interactiva. |
| `GET /docs/openapi.json` | Documento OpenAPI. |
| `WS /realtime?ticket=…` | Canal de tiempo real hacia el visor ([ADR-0006](../../docs/adr/0006-canal-de-tiempo-real.md)). |

Todas las rutas de `/api/v1` y el canal de tiempo real exigen autenticación; las de salud y la documentación, no. `/metrics` usa su propio token.

## Autenticación y autorización

La API es un *resource server* de OpenID Connect ([ADR-0009](../../docs/adr/0009-autenticacion-y-autorizacion.md)):

- **Tokens.** Valida el token de acceso de la cabecera `Authorization: Bearer` con las claves públicas del emisor (`AUTH_ISSUER`), que obtiene por descubrimiento o de `AUTH_JWKS_URL`. Comprueba la firma, la caducidad, el emisor y la audiencia (`AUTH_AUDIENCE`). No depende de qué proveedor emite el token: en local es Keycloak (`infra/keycloak`).
- **Roles.** Se leen de `AUTH_ROLES_CLAIM` (por defecto `realm_access.roles`, el formato de Keycloak). Basta `viewer` para consultar; `admin` incluye `viewer`.
- **Errores.** Sin token o con uno no válido, `401` con `WWW-Authenticate: Bearer`. Sin el rol necesario, `403`. Si no se pueden obtener las claves del emisor, `503`. Todos en formato RFC 9457.
- **Rutas públicas.** Se marcan con `@Public()`; hoy solo las de salud.
- **Tiempo real.** El navegador no puede enviar cabeceras al abrir un WebSocket, así que el visor pide un tique con `POST /api/v1/realtime/tickets` y conecta a `/realtime?ticket=…`:
  - El tique caduca a los 30 segundos y una instancia no acepta el mismo dos veces.
  - Está firmado con `REALTIME_TICKET_SECRET`, compartido por todas las instancias.
  - Sin tique válido, la conexión se cierra con el código `4401`. También se cierra con `4401` cuando caduca el token con el que se pidió.

Las pruebas usan un emisor OpenID Connect mínimo (`src/testing/auth.ts`) que firma tokens como Keycloak, sin contenedores.

## Seguridad HTTP

Medidas de LF-52 para una API expuesta a Internet:

| Medida | Detalle |
|---|---|
| Cabeceras | helmet: `Content-Security-Policy: default-src 'none'` en las respuestas de la API (son JSON y no cargan nada), HSTS, `nosniff`, `no-referrer`, sin `X-Powered-By`. `/docs` usa la política por defecto de helmet para que funcione Swagger UI. |
| Límite de peticiones | `RATE_LIMIT_PER_MINUTE` por cliente (300 por defecto). Al superarlo, `429` con `Retry-After`. La salud no cuenta. El contador es de cada instancia. |
| Proxies | `TRUST_PROXY_HOPS` indica cuántos proxies hay delante. Detrás del balanceador de la plataforma hace falta para identificar al cliente por `X-Forwarded-For` y no por la dirección del proxy. |
| Tamaño | Cuerpos de hasta 16 KB (`413` si es mayor) y mensajes WebSocket de hasta 1 KB (cierre `1009`). |
| CORS | Solo los orígenes de `CORS_ORIGINS`, que deben ser URL completas: no se admiten comodines. |
| Dependencias | La CI falla con vulnerabilidades conocidas de severidad alta o crítica (`pnpm audit --audit-level high`). |

## Ingesta de telemetría

`MqttIngestionService` se suscribe a `logicflows/v1/+/+/+` con QoS 1 y una **sesión persistente** (MQTT 5, caducidad de 1 hora): si la API se reinicia, el broker le entrega los cambios de estado producidos mientras estaba caída. Por cada mensaje:

1. **Validación** con `decodeMessage` de `@logicflows/contract`: topic, JSON, esquema y coherencia con el topic. Un mensaje inválido se descarta con un aviso y la suscripción continúa.
2. **Secuencia** con `SequenceGuard`, según ADR-0004: descarta duplicados (sin aviso), mensajes desordenados y de sesiones anteriores, y avisa de los mensajes de estado perdidos. Los retenidos ya procesados que el broker reenvía al reconectar se descartan sin aviso.
3. **Publicación** en `TelemetryStream`, un flujo interno (RxJS) del que leen el tiempo real y la persistencia sin depender de MQTT.

La conexión no bloquea el arranque: si el broker no está disponible, la API arranca, `/health/ready` lo indica y se reconecta sola.

## API REST

Consultas bajo `/api/v1`: la versión mayor forma parte de la ruta.

- **Estado actual:** la misma información que envía el canal de tiempo real (conexión, estado con alarmas y telemetría de cada célula).
- **Producción:** cajas y pallets producidos en `[from, to)`, calculados por diferencias de contadores. `from` y `to` son fechas ISO 8601 con zona horaria; sin ellas, las últimas 24 horas. El rango máximo es de 31 días.
- **Validación** con Zod: la planta y la célula siguen el formato del contrato y el rango se comprueba antes de consultar la base de datos.
- **Errores** con el formato de RFC 9457 (*Problem Details*, `application/problem+json`) en toda la API: `type`, `title`, `status`, `detail`, `instance` y, en los errores de validación, `errors` con cada campo incorrecto. Los errores inesperados se registran y se responden sin detalles internos. Las comprobaciones de salud conservan el formato estándar de Terminus.
- **OpenAPI:** los esquemas de respuesta se generan a partir del contrato, así que la documentación no puede divergir de los tipos.
- **CORS:** solo los orígenes de `CORS_ORIGINS` pueden llamar a la API desde el navegador, y solo con `GET`.

```sh
curl 'http://localhost:3000/api/v1/sites/demo/cells/cell-01/production?from=2026-10-05T06:00:00Z&to=2026-10-05T14:00:00Z'
```

## Persistencia

Acceso a datos con Drizzle ORM sobre `pg` ([ADR-0007](../../docs/adr/0007-acceso-a-datos-y-migraciones.md)). `PersistenceService` guarda en orden cada mensaje aceptado por la ingesta:

| Tabla | Contenido |
|---|---|
| `cell_status_events` | Cambios de conexión de cada célula |
| `cell_state_changes` | Historial de estados con sus alarmas activas |
| `telemetry_samples` | Cada telemetría recibida, con sus contadores acumulados |

- **Idempotencia:** cada tabla tiene una restricción única sobre la identidad del mensaje (planta, célula, sesión y secuencia) y se inserta con `ON CONFLICT DO NOTHING`. Un duplicado no se guarda dos veces aunque la API se reinicie.
- **Producción por periodo:** `TelemetryRepository.production()` suma las diferencias entre muestras consecutivas de cada sesión con funciones de ventana. La primera muestra de una sesión y los reinicios de contadores cuentan desde cero.
- **Recuperación:** al arrancar, la información de tiempo real de cada célula se recupera de la base de datos.
- **Cortes de conexión:** si PostgreSQL cierra una conexión inactiva, por ejemplo al reiniciarse, el pool la descarta, registra un aviso (`PostgreSQL cerró una conexión inactiva`) y abre otra cuando la necesita. Mientras la base de datos no responde, `/health/ready` devuelve 503 con `database: down`, pero la API sigue en marcha.
- **Migraciones:** SQL versionado en `drizzle/`, generado a partir de `src/database/schema.ts` y aplicado automáticamente al arrancar. Para crear una migración tras cambiar el esquema:

  ```sh
  pnpm --filter @logicflows/api db:generate --name descripcion-del-cambio
  ```

  Una migración ya fusionada no se modifica: se añade otra.

## Tiempo real

`CellStateStore` guarda la última conexión, estado y telemetría de cada célula a partir del flujo de la ingesta. `RealtimeGateway` expone un WebSocket nativo en `/realtime` que envía mensajes JSON tipados en `@logicflows/contract` (`RealtimeMessage`):

| Mensaje | Cuándo | Contenido |
|---|---|---|
| `{ "type": "snapshot", "cells": [...] }` | Al conectar | Información de todas las células conocidas |
| `{ "type": "cell", "cell": {...} }` | En cada mensaje aceptado por la ingesta | Información actualizada de esa célula |

Cada `cell` incluye `siteId`, `cellId` y los últimos mensajes `status`, `state` y `telemetry` recibidos (`null` si aún no ha llegado ninguno). El servidor envía un *ping* cada 30 segundos y cierra las conexiones que no responden. El cliente reconecta por su cuenta y recibe una instantánea nueva.

**La instantánea marca el inicio de la suscripción.** El WebSocket se abre antes de que la API valide el tique, y durante ese intervalo no se envían cambios. Un cliente se considera conectado cuando recibe `snapshot`, no cuando se abre el WebSocket: la instantánea ya incluye cualquier cambio anterior, y los mensajes `cell` que llegan después contienen todos los posteriores.

Para observar el canal con la API en marcha:

```sh
pnpm dlx wscat -c "ws://localhost:3000/realtime?ticket=$TIQUE"
```

## Uso

Con el fichero `.env` creado en la raíz del repositorio:

```sh
pnpm api
```

## Configuración

Se valida al arrancar; un valor no válido detiene la API indicando qué variable falla.

| Variable | Por defecto | Descripción |
|---|---|---|
| `API_PORT` | `3000` | Puerto HTTP |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` o `error` |
| `MQTT_URL` | `mqtt://127.0.0.1:1883` | Dirección del broker: `mqtt://` o `mqtts://` por TCP, `ws://` o `wss://` por WebSocket ([ADR-0008](../../docs/adr/0008-plataforma-de-despliegue.md)) |
| `MQTT_API_USERNAME` | `api` | Usuario del broker |
| `MQTT_API_PASSWORD` | — | Contraseña del broker (obligatoria) |
| `MQTT_CLIENT_ID` | `logicflows-api-` + nombre del equipo | Identificador del cliente MQTT, distinto en cada instancia; el broker asocia a él la sesión persistente |
| `DATABASE_URL` | — | Conexión con PostgreSQL (obligatoria) |
| `CORS_ORIGINS` | `http://localhost:4200` | Orígenes autorizados desde el navegador, separados por comas |
| `AUTH_ISSUER` | — | Emisor OpenID Connect de los tokens (obligatoria) |
| `AUTH_AUDIENCE` | `logicflows-api` | Audiencia que deben incluir los tokens |
| `AUTH_JWKS_URL` | Descubrimiento | Claves públicas del emisor, si la API llega a él por otra dirección que el navegador |
| `AUTH_ROLES_CLAIM` | `realm_access.roles` | Ruta de los roles dentro del token |
| `RATE_LIMIT_PER_MINUTE` | `300` | Peticiones por minuto de cada cliente antes de responder `429` |
| `TRUST_PROXY_HOPS` | `0` | Proxies de confianza delante de la API |
| `REALTIME_TICKET_SECRET` | — | Secreto de al menos 32 caracteres para firmar los tiques; el mismo en todas las instancias (obligatoria) |
| `METRICS_TOKEN` | — | Token de al menos 32 caracteres con el que se piden las métricas en `/metrics`. Sin valor, la ruta no existe |
| `FCM_SERVICE_ACCOUNT` | — | JSON de la cuenta de servicio de Firebase con la que se envían los avisos de alarmas. Sin valor, no se envían |
| `HISTORY_AGGREGATION_INTERVAL_MS` | `30000` | Cada cuánto se agregan las horas pendientes del histórico |
| `HISTORY_RAW_RETENTION_DAYS` | `0` | Días de telemetría en bruto que se conservan; 0, sin límite |
| `HISTORY_EVENTS_RETENTION_DAYS` | `0` | Días de cambios de estado y de conexión que se conservan; 0, sin límite |

## Varias instancias

Se pueden ejecutar varias instancias de la API contra el mismo broker y la misma base de datos, por ejemplo durante una actualización sin corte:

- **Identificador MQTT propio.** El broker desconecta a un cliente cuando otro se conecta con el mismo identificador. Por defecto, cada instancia usa `logicflows-api-` seguido del nombre de su equipo, que en un contenedor es único. Se mantiene mientras vive la instancia, así que el broker conserva su sesión persistente entre reconexiones.
- **Todas reciben todo.** Cada instancia se suscribe a todos los topics y mantiene el estado completo para sus clientes WebSocket. No se usan suscripciones compartidas, que repartirían los mensajes entre instancias.
- **Sin duplicados en la base de datos.** Cada instancia intenta guardar cada mensaje y las restricciones únicas de [ADR-0007](../../docs/adr/0007-acceso-a-datos-y-migraciones.md) descartan las copias.

Una prueba de integración lo comprueba con dos instancias. Las sesiones de las instancias que desaparecen caducan en el broker al cabo de una hora.

## Registro

Los logs se emiten en JSON con pino (`nestjs-pino`): una línea por evento con el nivel, la marca de tiempo, el servicio y el contexto. El nivel va como texto (`"level":"info"`), que es lo que Railway sabe filtrar. Cada petición HTTP se registra con su método, ruta, estado y duración, excepto las comprobaciones de salud y las recogidas de métricas. Las cabeceras `Authorization` y `Cookie` se ocultan.

## Métricas

`/metrics` publica en formato Prometheus las métricas de la ingesta, del tiempo real, de la salud y de cada célula, además de las estándar de Node.js ([ADR-0013](../../docs/adr/0013-observabilidad.md)). Cada módulo registra las suyas en `MetricsService`, un registro propio de la aplicación. El panel y las alertas que las usan, y cómo leerlos, están en [Observabilidad](../../infra/grafana/README.md).

## Histórico agregado por hora

El histórico se resume por célula y hora en `cell_hourly`: cajas, pallets, segundos en cada situación, paradas por causa y alarmas activadas ([ADR-0016](../../docs/adr/0016-almacenamiento-del-historico.md), [indicadores de planta](../../docs/indicadores-de-planta.md)).

- **Horas pendientes.** Al guardar un mensaje, su hora queda en `cell_hourly_pending`; un estado o una conexión marcan también la hora siguiente. La migración `0002` marca todas las horas que ya tenían datos.
- **Agregación.** `HistoryAggregator` recalcula hasta 200 horas pendientes cada `HISTORY_AGGREGATION_INTERVAL_MS` (30 s por defecto):
  - **Bloqueo:** un bloqueo consultivo de PostgreSQL hace que solo trabaje una réplica a la vez.
  - **Idempotencia:** el resultado no depende de cuántas veces se calcule una hora.
  - **Un solo reloj:** las marcas y el inicio del cálculo usan el de PostgreSQL, así que un mensaje que llega mientras se calcula deja la hora pendiente.
- **Producción de una hora.** La consulta solo lee las muestras de esa hora y la última anterior de cada sesión, no todo el histórico.
- **Retención.** `RetentionService` borra por lotes el dato en bruto más antiguo que `HISTORY_RAW_RETENTION_DAYS` (telemetría) y `HISTORY_EVENTS_RETENTION_DAYS` (estados y conexiones).
  - Conserva siempre el último mensaje de cada célula.
  - No borra mientras queden horas antiguas sin agregar.
  - Con 0, el valor por defecto, no borra nada: en producción se activará con 30 y 365 días cuando haya copias de seguridad (LF-82).
- **Métrica:** `logicflows_history_pending_hours` indica cuántas horas faltan por agregar.

## Avisos de alarmas

La API avisa en el móvil de las alarmas graves con Firebase Cloud Messaging ([ADR-0015](../../docs/adr/0015-avisos-de-alarmas-en-el-movil.md)):

- **Qué avisa:** las alarmas `CRITICAL` y `HIGH` de cada mensaje `state`, y la parada de emergencia cuando la célula no trae una alarma crítica que la explique (`src/push/alarm-activations.ts`).
- **Una vez por activación** (célula, `code` y `raisedAt`). La tabla `push_notified_alarms` y su restricción única lo garantizan también con mensajes repetidos, reinicios o varias réplicas.
- **Contenido:** la gravedad y la célula, nunca el texto de la alarma. Caduca a la hora, y un aviso por célula sustituye al anterior.
- **Dispositivos:** la app registra su token en `POST /api/v1/push/devices`. Los tokens que FCM ya no reconoce se borran solos.
- **Métrica:** `logicflows_push_notifications_total{result}` cuenta los envíos por resultado.

Sin `FCM_SERVICE_ACCOUNT`, el registro de dispositivos funciona, pero no se envía ningún aviso.

## Estructura

| Ruta | Responsabilidad |
|---|---|
| `src/main.ts` | Arranque: logger, cierre ordenado y puerto |
| `src/setup.ts` | Configuración común del arranque y de las pruebas: prefijo REST, CORS, errores, WebSocket y OpenAPI |
| `src/cells/` | API REST de células: controladores, validación y esquemas OpenAPI |
| `src/common/` | Formato de errores (RFC 9457) y validación con Zod |
| `src/app.module.ts` | Módulo raíz: configuración, registro y módulos funcionales |
| `src/config/` | Validación de la configuración con Zod |
| `src/health/` | Comprobaciones de salud con `@nestjs/terminus` |
| `src/ingestion/` | Suscripción MQTT, guardia de secuencia, indicador de salud del broker y flujo interno |
| `src/database/` | Esquema, conexión, migraciones e indicador de salud de PostgreSQL |
| `src/persistence/` | Guardado de los mensajes, consultas de producción y recuperación del estado |
| `src/metrics/` | Registro de métricas y ruta `/metrics` |
| `src/realtime/` | Información de cada célula y canal WebSocket hacia el visor |
| `drizzle/` | Migraciones SQL versionadas |
| `src/testing/` | Ayudantes de las pruebas de integración: broker con Testcontainers y aplicación completa |
| `src/openapi.ts` | Documentación OpenAPI con `@nestjs/swagger` |

## Scripts

| Script | Qué hace |
|---|---|
| `dev` | Compila y reinicia al cambiar (`nest start --watch`), con el `.env` de la raíz |
| `build` · `start` | Compila a `dist` y ejecuta la versión compilada |
| `test` | Pruebas unitarias con cobertura |
| `test:integration` | Pruebas con Mosquitto y PostgreSQL reales (Testcontainers): salud, ingesta, descarte de mensajes, reconexión, tiempo real, persistencia, idempotencia, producción, recuperación tras reiniciar y API REST |
| `db:generate` | Genera una migración a partir de los cambios del esquema |
