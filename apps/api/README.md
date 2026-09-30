# API

Única puerta de entrada de los datos de planta: se suscribe a la telemetría MQTT, la valida contra el contrato, la persiste en PostgreSQL y la expone por REST y WebSocket.

NestJS 12 sobre Node.js, con módulos ES y TypeScript estricto.

## Estado actual

Esqueleto operativo (LF-23), ingesta de telemetría (LF-26), canal de tiempo real (LF-27), persistencia en PostgreSQL (LF-32) y API REST (LF-33).

| Ruta | Contenido |
|---|---|
| `GET /health/live` | Vivacidad: el proceso responde. Si falla, el orquestador reinicia la API. |
| `GET /health/ready` | Disponibilidad: la API está conectada al broker MQTT y a PostgreSQL. Responde `503` si falta alguno. |
| `GET /api/v1/cells` | Estado actual de todas las células. |
| `GET /api/v1/sites/{siteId}/cells/{cellId}` | Estado actual de una célula. |
| `GET /api/v1/sites/{siteId}/cells/{cellId}/production?from&to` | Cajas y pallets producidos en un periodo. |
| `GET /docs` | Documentación OpenAPI interactiva. |
| `GET /docs/openapi.json` | Documento OpenAPI. |
| `WS /realtime` | Canal de tiempo real hacia el visor ([ADR-0006](../../docs/adr/0006-canal-de-tiempo-real.md)). |

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

Para observar el canal con la API en marcha:

```sh
pnpm dlx wscat -c ws://localhost:3000/realtime
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
| `MQTT_URL` | `mqtt://127.0.0.1:1883` | Dirección del broker |
| `MQTT_API_USERNAME` | `api` | Usuario del broker |
| `MQTT_API_PASSWORD` | — | Contraseña del broker (obligatoria) |
| `MQTT_CLIENT_ID` | `logicflows-api` | Identificador del cliente; el broker asocia a él la sesión persistente |
| `DATABASE_URL` | — | Conexión con PostgreSQL (obligatoria) |
| `CORS_ORIGINS` | `http://localhost:4200` | Orígenes autorizados desde el navegador, separados por comas |

## Registro

Los logs se emiten en JSON con pino (`nestjs-pino`): una línea por evento con el nivel, la marca de tiempo, el servicio y el contexto. Cada petición HTTP se registra con su método, ruta, estado y duración, excepto las comprobaciones de salud. Las cabeceras `Authorization` y `Cookie` se ocultan.

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
