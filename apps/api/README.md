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
| `GET /api/v1/sites/{siteId}/cells/{cellId}/production?from&to` | Cajas y palés producidos en un periodo. |
| `GET /api/v1/sites/{siteId}/cells/{cellId}/history?from&to&resolution&timeZone` | Histórico e indicadores de planta, en total y por horas o por días. |
| `GET /api/v1/sites/{siteId}/cells/{cellId}/events?from&to&limit` | Registro de cambios de estado, con sus alarmas y su duración, de conexión y de reconocimientos. |
| `GET /api/v1/sites/{siteId}/comparison?from&to&resolution&timeZone` | Indicadores de todas las células de una planta en el mismo periodo, para compararlas (LF-129). |
| `POST /api/v1/realtime/tickets` | Tique de un solo uso para abrir el canal de tiempo real. |
| `POST /api/v1/push/devices` | Registra el token de FCM del dispositivo para recibir avisos de alarmas ([ADR-0015](../../docs/adr/0015-avisos-de-alarmas-en-el-movil.md)). |
| `DELETE /api/v1/push/devices` | Da de baja un dispositivo del usuario. |
| `GET /api/v1/sites/{siteId}/calendar` | Calendario de turnos de una planta: versión vigente, futuras y excepciones ([ADR-0021](../../docs/adr/0021-calendario-de-turnos.md)). |
| `PUT`, `DELETE /api/v1/sites/{siteId}/calendar/versions/{effectiveFrom}` | Crea, sustituye o borra una versión futura del calendario. Rol `admin`. |
| `PUT`, `DELETE /api/v1/sites/{siteId}/calendar/exceptions/{date}` | Marca o desmarca un día futuro sin turnos. Rol `admin`. |
| `POST /api/v1/sites/{siteId}/cells/{cellId}/alarms/{code}/acknowledgements` | Reconoce una alarma activa ([ADR-0022](../../docs/adr/0022-reconocimiento-de-alarmas.md)). Rol `operator`. |
| `GET /docs` | Documentación OpenAPI interactiva. |
| `GET /docs/openapi.json` | Documento OpenAPI. |
| `WS /realtime?ticket=…` | Canal de tiempo real hacia el visor ([ADR-0006](../../docs/adr/0006-canal-de-tiempo-real.md)). |

Todas las rutas de `/api/v1` y el canal de tiempo real exigen autenticación; las de salud y la documentación, no. `/metrics` usa su propio token.

## Autenticación y autorización

La API es un *resource server* de OpenID Connect ([ADR-0009](../../docs/adr/0009-autenticacion-y-autorizacion.md)):

- **Tokens.** Valida el token de acceso de la cabecera `Authorization: Bearer` con las claves públicas del emisor (`AUTH_ISSUER`), que obtiene por descubrimiento o de `AUTH_JWKS_URL`. Comprueba la firma, la caducidad, el emisor y la audiencia (`AUTH_AUDIENCE`). No depende de qué proveedor emite el token: en local es Keycloak (`infra/keycloak`).
- **Roles.** Se leen de `AUTH_ROLES_CLAIM` (por defecto `realm_access.roles`, el formato de Keycloak). Basta `viewer` para consultar; `operator` reconoce alarmas (ADR-0022), y `admin` administra. Cada rol incluye los anteriores, también en la API.
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
- **Producción:** cajas y palés producidos en `[from, to)`, calculados por diferencias de contadores. `from` y `to` son fechas ISO 8601 con zona horaria; sin ellas, las últimas 24 horas. El rango máximo es de 31 días.
- **Histórico e indicadores:** producción, tiempos, disponibilidad, rendimiento y paradas por causa en `[from, to)`, en total (`summary`) y por horas o por días (`periods`), con las definiciones de [indicadores de planta](../../docs/indicadores-de-planta.md).
  - `from` y `to` son horas en punto; con `resolution=day`, medianoches de `timeZone` (zona IANA, UTC por defecto). Los días del cambio de hora tienen 23 o 25 horas.
  - Sin fechas: las últimas 24 horas por horas, o los últimos 7 días por días, incluido el periodo en curso.
  - Rango máximo: 31 días por horas y 366 por días.
  - Se calcula con los agregados por hora: una hora sin agregado cuenta como tiempo sin datos y, de la hora en curso, solo lo ya agregado.
  - El ritmo nominal es `NOMINAL_BOXES_PER_HOUR`, salvo las células de `NOMINAL_BOXES_PER_HOUR_BY_CELL`.
- **Registro de eventos** (LF-84): los cambios de estado, con sus alarmas activas y su duración hasta el cambio siguiente, y los de conexión en `[from, to)`, del más reciente al más antiguo.
  - Mismo periodo que la producción: sin fechas, las últimas 24 horas, y como mucho 31 días.
  - Como mucho `limit` eventos (200 por defecto, 500 como máximo). `truncated` indica que el periodo tiene más.
  - Lee el dato en bruto: con la retención de ADR-0016, los cambios de estado se conservan 365 días.
- **Células sin estado en tiempo real** (LF-85): el histórico, el registro y la producción responden aunque la célula no tenga estado actual, si tiene datos guardados. Le pasa, por ejemplo, a una célula cargada con histórico simulado.
- **Validación** con Zod: la planta y la célula siguen el formato del contrato y el rango se comprueba antes de consultar la base de datos.
- **Errores** con el formato de RFC 9457 (*Problem Details*, `application/problem+json`) en toda la API: `type`, `title`, `status`, `detail`, `instance` y, en los errores de validación, `errors` con cada campo incorrecto. Los errores inesperados se registran y se responden sin detalles internos. Las comprobaciones de salud conservan el formato estándar de Terminus.
- **OpenAPI:** los esquemas de respuesta se generan a partir del contrato, así que la documentación no puede divergir de los tipos.
- **CORS:** solo los orígenes de `CORS_ORIGINS` pueden llamar a la API desde el navegador, y solo con `GET`.

```sh
curl 'http://localhost:3000/api/v1/sites/demo/cells/cell-01/production?from=2026-10-05T06:00:00Z&to=2026-10-05T14:00:00Z'
curl 'http://localhost:3000/api/v1/sites/demo/cells/cell-01/history?resolution=day&timeZone=Europe/Madrid'
```

## Persistencia

Acceso a datos con Drizzle ORM sobre `pg` ([ADR-0007](../../docs/adr/0007-acceso-a-datos-y-migraciones.md)). `PersistenceService` guarda en orden cada mensaje aceptado por la ingesta:

| Tabla | Contenido |
|---|---|
| `cell_status_events` | Cambios de conexión de cada célula |
| `cell_state_changes` | Historial de estados con sus alarmas activas |
| `telemetry_samples` | Cada telemetría recibida, con sus contadores acumulados |

- **Idempotencia:** cada tabla tiene una restricción única sobre la identidad del mensaje (planta, célula, sesión y secuencia) y se inserta con `ON CONFLICT DO NOTHING`. Un duplicado no se guarda dos veces aunque la API se reinicie.
- **Producción por periodo:** suma las diferencias entre muestras consecutivas de cada sesión con funciones de ventana. La primera muestra de una sesión y los reinicios de contadores cuentan desde cero. Las horas completas salen del histórico agregado y el resto, del dato en bruto, leyendo solo el periodo y la muestra anterior de cada sesión (`HistoryService.production()`).
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
| `HISTORY_AGGREGATES_RETENTION_DAYS` | `0` | Días de agregados por hora que se conservan; 0, sin límite |
| `NOMINAL_BOXES_PER_HOUR` | `900` | Ritmo nominal de las células en cajas por hora, base del rendimiento |
| `NOMINAL_BOXES_PER_HOUR_BY_CELL` | — | Ritmo nominal de células concretas, como `demo/cell-02=1200,demo/cell-03=600` |

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

El histórico se resume por célula y hora en `cell_hourly`: cajas, palés, segundos en cada situación, paradas por causa y alarmas activadas ([ADR-0016](../../docs/adr/0016-almacenamiento-del-historico.md), [indicadores de planta](../../docs/indicadores-de-planta.md)).

- **Horas pendientes.** Al guardar un mensaje, su hora queda en `cell_hourly_pending`; un estado o una conexión marcan también la hora siguiente. La migración `0002` marca todas las horas que ya tenían datos.
- **Agregación.** `HistoryAggregator` recalcula hasta 200 horas pendientes cada `HISTORY_AGGREGATION_INTERVAL_MS` (30 s por defecto):
  - **Bloqueo:** un bloqueo consultivo de PostgreSQL hace que solo trabaje una réplica a la vez.
  - **Idempotencia:** el resultado no depende de cuántas veces se calcule una hora.
  - **Un solo reloj:** las marcas y el inicio del cálculo usan el de PostgreSQL, así que un mensaje que llega mientras se calcula deja la hora pendiente.
- **Producción de una hora.** La consulta solo lee las muestras de esa hora y la última anterior de cada sesión, no todo el histórico.
- **Hora en curso.** Se resume hasta el momento del cálculo y sigue pendiente hasta que termina, así que se completa aunque la célula deje de enviar mensajes.
- **Consultas.** `HistoryService` calcula los indicadores de cualquier periodo sumando sus horas. Con 90 días agregados, el histórico de 30 días responde en milisegundos (lo comprueba la prueba de integración).
- **Retención.** Cada hora, `RetentionService` borra por lotes el dato en bruto más antiguo que `HISTORY_RAW_RETENTION_DAYS` (telemetría) y `HISTORY_EVENTS_RETENTION_DAYS` (estados y conexiones), y los agregados más antiguos que `HISTORY_AGGREGATES_RETENTION_DAYS`. Los avisos ya enviados se borran siempre al día: solo se avisa de activaciones de los últimos 15 minutos.
  - Conserva siempre el último mensaje de cada célula.
  - No borra mientras queden horas antiguas sin agregar.
  - Con 0, el valor por defecto, no borra nada. La demo usa 2, 31 y 31 días (ADR-0019); una planta real, 30 y 365 días y los agregados sin límite (ADR-0016).
- **Métrica:** `logicflows_history_pending_hours` indica cuántas horas faltan por agregar.

## Avisos de alarmas

La API avisa en el móvil de las alarmas graves con Firebase Cloud Messaging ([ADR-0015](../../docs/adr/0015-avisos-de-alarmas-en-el-movil.md)):

- **Qué avisa:** las alarmas `CRITICAL` y `HIGH` de cada mensaje `state`, y la parada de emergencia cuando la célula no trae una alarma crítica que la explique (`src/push/alarm-activations.ts`).
- **Una vez por activación** (célula, `code` y `raisedAt`). La tabla `push_notified_alarms` y su restricción única lo garantizan también con mensajes repetidos, reinicios o varias réplicas.
- **Contenido:** la gravedad y la célula, nunca el texto de la alarma. Caduca a la hora, y un aviso por célula sustituye al anterior.
- **Dispositivos:** la app registra su token en `POST /api/v1/push/devices`. Los tokens que FCM ya no reconoce se borran solos.
- **Métrica:** `logicflows_push_notifications_total{result}` cuenta los envíos por resultado.

Sin `FCM_SERVICE_ACCOUNT`, el registro de dispositivos funciona, pero no se envía ningún aviso.

## Reconocimiento de alarmas

Una persona con `operator` dice «la he visto y me ocupo» ([ADR-0022](../../docs/adr/0022-reconocimiento-de-alarmas.md)). No resuelve la alarma ni llega a la célula: la API sigue sin publicar en MQTT.

- **Activación:** se reconoce el `code` y el `raisedAt` de una alarma activa en el último estado conocido de la célula. Si no está activa, 409.
- **Una vez por activación:** la clave primaria de `alarm_acknowledgements` decide quién llegó antes. El segundo recibe 200 con el reconocimiento existente.
- **Quién y cuándo:** el sujeto y el nombre del token, y la hora del servidor. El evento `alarm.acknowledged` va al log con `audit: true`, el usuario y la IP.
- **Tiempo real:** la célula lleva `acknowledgements` con los reconocimientos de sus alarmas activas, solo si hay alguno. Al resolverse la alarma, desaparece de la célula, pero no del registro.
- **Registro de eventos:** cada reconocimiento es un evento `acknowledgement`. Se conserva como los cambios de estado.
- **Varias réplicas:** cada réplica conoce los reconocimientos que hizo ella y los de las alarmas activas al arrancar. Un visor conectado a otra réplica lo verá al reconectar. Producción tiene una réplica.

## Calendario de turnos

El tiempo planificado de los indicadores sale del calendario de turnos de cada planta ([ADR-0021](../../docs/adr/0021-calendario-de-turnos.md)):

- **Versiones con fecha de entrada en vigor**, con su zona horaria y sus turnos semanales en horas en punto. Un turno que termina antes de empezar cruza la medianoche. La API rechaza los solapes (400).
- **Excepciones:** días sin turnos de una planta (festivos, vacaciones, mantenimiento).
- **El pasado no se reescribe:** versiones y excepciones solo se crean, cambian o borran a partir de mañana, en la hora local de la planta (409 si no).
- **Quién y cuándo:** cada versión y excepción guarda el sujeto y el nombre de usuario de quien la creó. Cada cambio se escribe además en el log como evento de auditoría (`audit: true`, `event: calendar.…`), con el antes y el después.
- **Hora de turno** (`src/calendar/calendar.ts`): una hora es de turno según la versión y las excepciones del día en que empezó el turno, en la hora local de la planta, con el cambio de hora incluido.
- **Indicadores:** el histórico decide una vez qué horas del periodo son de turno; en ellas, `STOPPED` es la parada «Detenida en turno» (`STOPPED` en las paradas). El agregador anota siempre las paradas `STOPPED`, y los indicadores solo las cuentan en turno. `seconds.shift` es el tiempo de turno del periodo.
- **La demo** carga su calendario con `infra/postgres/calendario-demo.sql`: mañana y tarde de lunes a viernes.

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
