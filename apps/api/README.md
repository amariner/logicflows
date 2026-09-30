# API

Única puerta de entrada de los datos de planta: se suscribe a la telemetría MQTT, la valida contra el contrato, la persiste en PostgreSQL y la expone por REST y WebSocket.

NestJS 12 sobre Node.js, con módulos ES y TypeScript estricto.

## Estado actual

Esqueleto operativo (LF-23), sobre el que se construyen la ingesta (LF-26), el tiempo real (LF-27) y la persistencia (LF-32):

| Ruta | Contenido |
|---|---|
| `GET /health/live` | Vivacidad: el proceso responde. Si falla, el orquestador reinicia la API. |
| `GET /health/ready` | Disponibilidad: la API puede atender peticiones. Comprobará el broker y PostgreSQL cuando se incorporen. |
| `GET /docs` | Documentación OpenAPI interactiva. |
| `GET /docs/openapi.json` | Documento OpenAPI. |

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

## Registro

Los logs se emiten en JSON con pino (`nestjs-pino`): una línea por evento con el nivel, la marca de tiempo, el servicio y el contexto. Cada petición HTTP se registra con su método, ruta, estado y duración, excepto las comprobaciones de salud. Las cabeceras `Authorization` y `Cookie` se ocultan.

## Estructura

| Ruta | Responsabilidad |
|---|---|
| `src/main.ts` | Arranque: logger, cierre ordenado, OpenAPI y puerto |
| `src/app.module.ts` | Módulo raíz: configuración, registro y módulos funcionales |
| `src/config/` | Validación de la configuración con Zod |
| `src/health/` | Comprobaciones de salud con `@nestjs/terminus` |
| `src/openapi.ts` | Documentación OpenAPI con `@nestjs/swagger` |

## Scripts

| Script | Qué hace |
|---|---|
| `dev` | Compila y reinicia al cambiar (`nest start --watch`), con el `.env` de la raíz |
| `build` · `start` | Compila a `dist` y ejecuta la versión compilada |
| `test` | Pruebas unitarias con cobertura |
| `test:integration` | Pruebas de la API por HTTP |
