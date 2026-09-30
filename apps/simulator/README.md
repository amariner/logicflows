# Simulador

Reproduce una célula de paletizado sin hardware real y publica su conexión, su estado y su telemetría por MQTT según el contrato ([ADR-0004](../../docs/adr/0004-mensajes-de-telemetria-y-topics-mqtt.md)), con los estados y transiciones de [ADR-0003](../../docs/adr/0003-estados-de-la-paletizadora.md).

## Comportamiento

1. Se conecta al broker con MQTT 5 y registra su *Last Will* (`status` con `online: false`).
2. Arranca: `STOPPED` → `STARTING` y, tras la secuencia de arranque, `RUNNING`.
3. Mientras produce, paletiza una caja por ciclo y publica una telemetría por caja. Cada ciclo dura `SIMULATOR_BOX_INTERVAL_MS` con una variación aleatoria de ±`SIMULATOR_CYCLE_VARIATION`, como un robot real. Completa capas y pallets según el formato configurado y, tras cada pallet completo, espera `SIMULATOR_PALLET_CHANGE_MS` mientras se retira y se coloca uno vacío. El tiempo de ciclo publicado refleja esas esperas y el ritmo es la media de los últimos 60 segundos.
4. Publica telemetría al menos cada 10 segundos aunque no haya cajas.
5. Tras cada conexión o reconexión vuelve a publicar su conexión, su estado y su telemetría, así que se recupera aunque el broker haya perdido sus datos.
6. Al recibir `SIGINT` o `SIGTERM` se detiene de forma controlada (`STOPPED`), publica `online: false` y cierra la conexión.

Los topics, los mensajes y las transiciones se toman de `@logicflows/contract`; el simulador no los redefine.

## Uso

Con el entorno local levantado (`pnpm infra:up`) y el fichero `.env` creado:

```sh
pnpm simulator
```

Para ver los mensajes publicados:

```sh
docker compose exec mosquitto mosquitto_sub -u api -P api-local -t 'logicflows/v1/#' -v
```

## Configuración

| Variable | Por defecto | Descripción |
|---|---|---|
| `MQTT_URL` | `mqtt://127.0.0.1:1883` | Dirección del broker |
| `MQTT_SIMULATOR_USERNAME` | `simulator` | Usuario del broker |
| `MQTT_SIMULATOR_PASSWORD` | — | Contraseña del broker (obligatoria) |
| `SIMULATOR_SITE_ID` | `demo` | Planta |
| `SIMULATOR_CELL_ID` | `cell-01` | Célula |
| `SIMULATOR_BOX_INTERVAL_MS` | `4000` | Tiempo nominal entre cajas mientras produce |
| `SIMULATOR_CYCLE_VARIATION` | `0.1` | Variación aleatoria del ciclo, de 0 a 0,5 (0,1 = ±10 %) |
| `SIMULATOR_PALLET_CHANGE_MS` | `8000` | Tiempo de cambio de pallet |
| `SIMULATOR_SEED` | — | Semilla para repetir exactamente una simulación |
| `SIMULATOR_STARTUP_DURATION_MS` | `3000` | Duración de la secuencia de arranque |
| `SIMULATOR_LAYERS_PER_PALLET` | `5` | Capas de un pallet completo |
| `SIMULATOR_BOXES_PER_LAYER` | `8` | Cajas de una capa completa |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` o `error` |

La configuración se valida al arrancar: un valor no válido detiene el simulador con un mensaje que indica cuál.

## Estructura

| Fichero | Responsabilidad |
|---|---|
| `src/domain/` | Modelo de la célula: estados, producción, ciclo, ritmo, estado de los componentes y aleatoriedad con semilla. Sin dependencias de MQTT ni del reloj. |
| `src/messages.ts` | Construcción de los mensajes del contrato con su sesión y sus secuencias. |
| `src/simulator.ts` | Temporizadores, transiciones y publicación. |
| `src/mqtt/connection.ts` | Conexión MQTT 5 con reconexión automática. |
| `src/main.ts` | Configuración, registro y arranque. |

## Scripts

| Script | Qué hace |
|---|---|
| `dev` | Ejecuta el código fuente con Node.js y lo reinicia al cambiar, sin compilar |
| `build` · `start` | Compila a `dist` y ejecuta la versión compilada |
| `test` | Pruebas unitarias con cobertura |
| `test:integration` | Prueba con un broker real que se reinicia a mitad de la prueba (necesita Docker) |
