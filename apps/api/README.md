# API

Única puerta de entrada de los datos de planta: se suscribe a la telemetría MQTT, la valida contra el contrato, la persiste en PostgreSQL y la expone por REST y WebSocket.

NestJS 12 sobre Node.js, con módulos ES y TypeScript estricto.

## Estado actual

Esqueleto operativo (LF-23) e ingesta de telemetría (LF-26). El tiempo real (LF-27) y la persistencia (LF-32) se construyen sobre ellos.

| Ruta | Contenido |
|---|---|
| `GET /health/live` | Vivacidad: el proceso responde. Si falla, el orquestador reinicia la API. |
| `GET /health/ready` | Disponibilidad: la API está conectada al broker MQTT. Responde `503` si no lo está. Comprobará PostgreSQL cuando se incorpore. |
| `GET /docs` | Documentación OpenAPI interactiva. |
| `GET /docs/openapi.json` | Documento OpenAPI. |

## Ingesta de telemetría

`MqttIngestionService` se suscribe a `logicflows/v1/+/+/+` con QoS 1 y una **sesión persistente** (MQTT 5, caducidad de 1 hora): si la API se reinicia, el broker le entrega los cambios de estado producidos mientras estaba caída. Por cada mensaje:

1. **Validación** con `decodeMessage` de `@logicflows/contract`: topic, JSON, esquema y coherencia con el topic. Un mensaje inválido se descarta con un aviso y la suscripción continúa.
2. **Secuencia** con `SequenceGuard`, según ADR-0004: descarta duplicados (sin aviso), mensajes desordenados y de sesiones anteriores, y avisa de los mensajes de estado perdidos. Los retenidos ya procesados que el broker reenvía al reconectar se descartan sin aviso.
3. **Publicación** en `TelemetryStream`, un flujo interno (RxJS) del que leen el tiempo real y la persistencia sin depender de MQTT.

La conexión no bloquea el arranque: si el broker no está disponible, la API arranca, `/health/ready` lo indica y se reconecta sola.

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

## Registro

Los logs se emiten en JSON con pino (`nestjs-pino`): una línea por evento con el nivel, la marca de tiempo, el servicio y el contexto. Cada petición HTTP se registra con su método, ruta, estado y duración, excepto las comprobaciones de salud. Las cabeceras `Authorization` y `Cookie` se ocultan.

## Estructura

| Ruta | Responsabilidad |
|---|---|
| `src/main.ts` | Arranque: logger, cierre ordenado, OpenAPI y puerto |
| `src/app.module.ts` | Módulo raíz: configuración, registro y módulos funcionales |
| `src/config/` | Validación de la configuración con Zod |
| `src/health/` | Comprobaciones de salud con `@nestjs/terminus` |
| `src/ingestion/` | Suscripción MQTT, guardia de secuencia, indicador de salud del broker y flujo interno |
| `src/testing/` | Ayudantes de las pruebas de integración: broker con Testcontainers y aplicación completa |
| `src/openapi.ts` | Documentación OpenAPI con `@nestjs/swagger` |

## Scripts

| Script | Qué hace |
|---|---|
| `dev` | Compila y reinicia al cambiar (`nest start --watch`), con el `.env` de la raíz |
| `build` · `start` | Compila a `dist` y ejecuta la versión compilada |
| `test` | Pruebas unitarias con cobertura |
| `test:integration` | Pruebas con un broker real (Testcontainers): salud con y sin broker, ingesta, descarte de mensajes y reconexión |
