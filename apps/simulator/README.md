# Simulador

Reproduce una célula de paletizado sin hardware real y publica su conexión, su estado y su telemetría por MQTT según el contrato ([ADR-0004](../../docs/adr/0004-mensajes-de-telemetria-y-topics-mqtt.md)), con los estados y transiciones de [ADR-0003](../../docs/adr/0003-estados-de-la-paletizadora.md).

## Comportamiento

1. Se conecta al broker con MQTT 5 y registra su *Last Will* (`status` con `online: false`).
2. Arranca: `STOPPED` → `STARTING` y, tras la secuencia de arranque, `RUNNING`.
3. Mientras produce, paletiza una caja por ciclo y publica una telemetría por caja. Cada ciclo dura `SIMULATOR_BOX_INTERVAL_MS` con una variación aleatoria de ±`SIMULATOR_CYCLE_VARIATION`, como un robot real. Completa capas y palés según el formato configurado y, tras cada palé completo, espera `SIMULATOR_PALLET_CHANGE_MS` mientras se retira y se coloca uno vacío. El tiempo de ciclo publicado refleja esas esperas y el ritmo es la media de los últimos 60 segundos.
4. Publica telemetría al menos cada 10 segundos aunque no haya cajas.
5. Tras cada conexión o reconexión vuelve a publicar su conexión, su estado y su telemetría, así que se recupera aunque el broker haya perdido sus datos.
6. Al recibir `SIGINT` o `SIGTERM` se detiene de forma controlada (`STOPPED`), publica `online: false` y cierra la conexión.

Los topics, los mensajes y las transiciones se toman de `@logicflows/contract`; el simulador no los redefine.

## Incidencias y alarmas

El simulador reproduce los estados de ADR-0003 mediante incidencias, cada una con su alarma y su secuencia de recuperación:

| Incidencia | Estado | Alarma | Recuperación |
|---|---|---|---|
| Colisión del robot | `FAULT` | `ROB-001` · alta | Rearme tras `SIMULATOR_FAULT_RECOVERY_MS` → `STOPPED`, y arranque tras `SIMULATOR_RESTART_DELAY_MS` |
| Pérdida de vacío en la pinza | `FAULT` | `ROB-002` · alta | Igual que un fallo |
| Atasco en la cinta de entrada | `FAULT` | `CONV-002` · media | Igual que un fallo |
| Parada de emergencia | `EMERGENCY_STOP` | `SAF-001` · crítica | Liberación y rearme tras `SIMULATOR_EMERGENCY_STOP_RECOVERY_MS` → `STOPPED` (o `FAULT` si queda un fallo activo), y arranque tras `SIMULATOR_RESTART_DELAY_MS` |
| Sin cajas en la entrada | `WAITING` (`STARVED`) | `CONV-001` · baja | Reanuda sola cuando llegan cajas |
| Salida de palés ocupada | `WAITING` (`BLOCKED`) | `OUT-001` · baja | Reanuda sola cuando se libera la salida |
| Pausa del operario | `PAUSED` | — | El operario reanuda |

Reglas de ADR-0003 que se cumplen:

- El rearme nunca pone la célula en marcha: siempre pasa por `STOPPED` y una orden de arranque.
- La parada de emergencia prevalece: un fallo durante ella solo añade su alarma.
- Una incidencia no prevista en el estado actual se rechaza (por ejemplo, pausar durante el arranque).
- En `FAULT`, solo se marca como averiado el componente afectado (robot o cinta).

Los mensajes `state` incluyen las alarmas activas y se publican también cuando solo cambian las alarmas (con `event: null`). La activación de las incidencias durante la simulación se configura con los escenarios.

## Escenarios

`SIMULATOR_SCENARIO` elige qué incidencias y problemas de red se producen durante la simulación. En los escenarios por frecuencia, cada segundo, cada incidencia ocurre con una probabilidad que corresponde a su frecuencia por hora. Con `SIMULATOR_SEED`, el histórico simulado se repite exactamente; en directo, solo aproximadamente, porque el orden de los temporizadores reales también cuenta.

| Escenario | Para qué sirve | Incidencias por hora | Red |
|---|---|---|---|
| `normal` (por defecto) | Desarrollo y pruebas del flujo básico | Ninguna | Sin problemas |
| `turno` | Ver cómo se comporta el sistema en un turno realista | 4 sin cajas y 2 salida ocupada (30 s – 3 min), 1 pausa, 1 fallo y una parada de emergencia cada 5 horas | Sin problemas |
| `averias` | Probar la monitorización de una célula problemática | 12 fallos, 3 paradas de emergencia, 6 sin cajas y 6 salida ocupada, 1 pausa | Sin problemas |
| `red-inestable` | Comprobar que la API aplica las reglas de ADR-0004 | Ninguna | 6 cortes por hora (5-30 s), 10 % de mensajes duplicados y 5 % retrasados para que lleguen desordenados |
| `guion` | La demo para compradores, en producción (ADR-0019) | Las de `src/guion-diario.ts`, a hora fija de Madrid y repetidas cada día: 10 esperas, 6 pausas, 5 fallos (3 graves, entre las 9:47 y las 20:05) y una parada de emergencia a las 11:15 | Sin problemas |
| `demo` | Enseñar todos los estados en pocos minutos | 30 fallos, 10 paradas de emergencia, 30 sin cajas y 20 salida ocupada (10-30 s), 10 pausas | 4 cortes por hora (5-15 s), 5 % duplicados y 2 % desordenados |

La velocidad se ajusta con `SIMULATOR_BOX_INTERVAL_MS` y los tiempos de recuperación con sus variables. Para una demostración ágil:

```sh
SIMULATOR_SCENARIO=demo SIMULATOR_BOX_INTERVAL_MS=1000 SIMULATOR_FAULT_RECOVERY_MS=5000 SIMULATOR_EMERGENCY_STOP_RECOVERY_MS=8000 pnpm simulator
```

**Guion diario (`guion`).** Lo que pasa cada día lo decide el reloj, no el azar: cada incidencia de `src/guion-diario.ts` ocurre a su hora local, todos los días, aunque el simulador se reinicie. Al arrancar no repite lo que ya pasó; sigue desde la hora actual. La semilla solo da la variación del ciclo. El histórico simulado sigue el mismo guion, así que el pasado y el directo encajan.

**Problemas de red simulados:**

- **Cortes:** la conexión se cierra de forma abrupta, sin desconexión limpia, así que el broker publica el *Last Will* (`online: false`). Al reconectar, la célula vuelve a publicar su conexión, su estado y su telemetría.
- **Duplicados:** un mensaje se envía dos veces, como ocurre con los reintentos de QoS 1. La API los descarta sin aviso.
- **Desorden:** un mensaje se retrasa unos segundos y llega después de otros más recientes. La API lo descarta, avisa y registra la pérdida aparente de los mensajes intermedios.

Con `red-inestable` o `demo`, los descartes aparecen en el log de la API con los motivos `DUPLICATE` y `OUT_OF_ORDER`.

## Varias células

Un mismo proceso puede simular varias células (LF-123), con `SIMULATOR_CELLS` separadas por comas. Si se define, sustituye a `SIMULATOR_CELL_ID`:

```sh
SIMULATOR_CELLS=cell-01,cell-02,cell-03,cell-04 pnpm simulator
```

- **Cada célula es independiente:** su conexión con el broker (identificador `simulator-<planta>-<célula>`), su testamento, su sesión y su secuencia, como si fueran máquinas distintas (ADR-0004).
- **Cada célula tiene un perfil** (`src/cells.ts`), fijo según su posición, para que no se paren todas a la vez y la comparación tenga sentido:

  | Posición | Guion | Esperas y pausas | Ritmo |
  |---|---|---|---|
  | 1.ª | El de siempre | Igual | Nominal (4 s por caja) |
  | 2.ª | 23 min más tarde | La mitad | 4 % más lenta |
  | 3.ª | 41 min más tarde | 1,6 veces más largas | 10 % más lenta |
  | 4.ª | 67 min más tarde | 2,2 veces más largas | 20 % más lenta |

  A partir de la quinta se repiten con otro desfase. Ninguna va más rápida que el ritmo nominal, así que el rendimiento nunca pasa del 100 %.
- **La semilla** de cada célula es la del proceso más su posición: la simulación se repite igual.
- **El histórico simulado** (`pnpm simulator:historico`) genera las células una detrás de otra, con su perfil. Con `SIMULATOR_BACKFILL_CELLS`, solo las indicadas: así se añaden células a una planta sin borrar el histórico de las que ya tenía.
- Hasta 20 células por proceso; cada una abre una conexión con el broker.

## Uso

Con el entorno local levantado (`pnpm infra:up`) y el fichero `.env` creado:

```sh
pnpm simulator
```

Para ver los mensajes publicados:

```sh
docker compose exec mosquitto mosquitto_sub -u api -P api-local -t 'logicflows/v1/#' -v
```

## Histórico simulado

`pnpm simulator:historico` genera N días de producción de las células, hasta el momento actual, y los publica por MQTT (LF-77):

```sh
SIMULATOR_BACKFILL_DAYS=90 SIMULATOR_SCENARIO=turno pnpm simulator:historico
```

- **Reloj virtual.** El mismo simulador se ejecuta con un reloj virtual (`src/virtual-clock.ts`), que mueve los temporizadores sin esperar. Las marcas de tiempo son las simuladas, y la configuración (célula, formato, tiempos, escenario y `SIMULATOR_SEED`) es la del simulador. Con la misma semilla, el histórico se repite.
- **Telemetría espaciada.** Se publica una cada 10 s como mucho, más una por cambio de estado. Los contadores son acumulados, así que la producción por periodo no cambia.
- **Mensajes no retenidos y sin *Last Will*.** El histórico no pasa por estado actual de la célula.
- **Ritmo limitado** (`SIMULATOR_BACKFILL_RATE`, 200 mensajes por segundo por defecto). Tiene que ir más despacio de lo que la API guarda: si no, el broker llena la cola de la API (50 000 mensajes) y descarta el resto sin avisar a quien publica (LF-123). 7 días de una célula, unos 63 000 mensajes, tardan unos 5 minutos.

**Cuándo se puede cargar.** La API descarta una sesión anterior a la que ya conoce (ADR-0004). El histórico se carga, por tanto, en una célula sin datos más recientes:

- en un entorno limpio, antes de arrancar el simulador en directo de esa célula;
- o en otra célula, con `SIMULATOR_CELL_ID`.

La API no avisa al móvil de las alarmas del histórico: solo avisa de las de los últimos 15 minutos (ADR-0015).

Dentro de la imagen del simulador está como `node dist/backfill-main.js`.

## Configuración

| Variable | Por defecto | Descripción |
|---|---|---|
| `MQTT_URL` | `mqtt://127.0.0.1:1883` | Dirección del broker: `mqtt://` o `mqtts://` por TCP, `ws://` o `wss://` por WebSocket ([ADR-0008](../../docs/adr/0008-plataforma-de-despliegue.md)) |
| `MQTT_SIMULATOR_USERNAME` | `simulator` | Usuario del broker |
| `MQTT_SIMULATOR_PASSWORD` | — | Contraseña del broker (obligatoria) |
| `SIMULATOR_SITE_ID` | `demo` | Planta |
| `SIMULATOR_CELL_ID` | `cell-01` | Célula |
| `SIMULATOR_BOX_INTERVAL_MS` | `4000` | Tiempo nominal entre cajas mientras produce |
| `SIMULATOR_CYCLE_VARIATION` | `0.1` | Variación aleatoria del ciclo, de 0 a 0,5 (0,1 = ±10 %) |
| `SIMULATOR_PALLET_CHANGE_MS` | `8000` | Tiempo de cambio de palé |
| `SIMULATOR_SCENARIO` | `normal` | Escenario de incidencias y red: `normal`, `turno`, `averias`, `red-inestable`, `demo` o `guion` |
| `SIMULATOR_SEED` | — | Semilla para repetir exactamente una simulación |
| `SIMULATOR_FAULT_RECOVERY_MS` | `20000` | Tiempo hasta resolver un fallo y rearmar |
| `SIMULATOR_EMERGENCY_STOP_RECOVERY_MS` | `30000` | Tiempo hasta liberar y rearmar una parada de emergencia |
| `SIMULATOR_RESTART_DELAY_MS` | `5000` | Tiempo entre el rearme y la orden de arranque |
| `SIMULATOR_STARTUP_DURATION_MS` | `3000` | Duración de la secuencia de arranque |
| `SIMULATOR_LAYERS_PER_PALLET` | `5` | Capas de un palé completo |
| `SIMULATOR_BOXES_PER_LAYER` | `8` | Cajas de una capa completa |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` o `error` |

La configuración se valida al arrancar: un valor no válido detiene el simulador con un mensaje que indica cuál.

## Estructura

| Fichero | Responsabilidad |
|---|---|
| `src/domain/` | Modelo de la célula: estados, alarmas, producción, ciclo, ritmo, estado de los componentes y aleatoriedad con semilla. Sin dependencias de MQTT ni del reloj. |
| `src/messages.ts` | Construcción de los mensajes del contrato con su sesión y sus secuencias. |
| `src/simulator.ts` | Temporizadores, incidencias con su recuperación, transiciones y publicación. |
| `src/testing/` | Simulador con conexión falsa que valida cada mensaje con el contrato. |
| `src/scenarios.ts` | Definición de los escenarios. |
| `src/incident-generator.ts` | Generador de incidencias y cortes de red según el escenario. |
| `src/mqtt/connection.ts` | Conexión MQTT 5 con reconexión automática y cortes abruptos simulados. |
| `src/mqtt/chaos-connection.ts` | Red poco fiable: mensajes duplicados y retrasados. |
| `src/main.ts` | Configuración, registro y arranque. |

## Scripts

| Script | Qué hace |
|---|---|
| `dev` | Ejecuta el código fuente con Node.js y lo reinicia al cambiar, sin compilar |
| `build` · `start` | Compila a `dist` y ejecuta la versión compilada |
| `historico` | Genera y publica N días de histórico simulado (`SIMULATOR_BACKFILL_DAYS`, 7 por defecto, hasta 120) |
| `test` | Pruebas unitarias con cobertura |
| `test:integration` | Prueba con un broker real que se reinicia a mitad de la prueba y un corte abrupto de red que dispara el *Last Will* (necesita Docker) |
