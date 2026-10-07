# ADR-0004: Mensajes de telemetría y topics MQTT

- **Estado:** Aceptado. Actualizado el 7 de octubre de 2026 (LF-117)
- **Fecha:** 2026-09-30
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-20

## Contexto

Las células de paletizado (hoy el simulador, mañana un PLC a través de un agente edge) publican su estado y su producción por MQTT. La API se suscribe, valida, persiste y reenvía los datos al visor por WebSocket. El visor no se conecta al broker.

Este contrato es la frontera entre ingeniería industrial, backend y frontend, y es lo más caro de cambiar una vez haya máquinas publicando. Debe resolver:

- Qué mensajes existen, qué contienen y en qué unidades.
- Cómo se organizan los topics y con qué garantías de entrega se publican.
- Cómo sabe la API que una célula se ha desconectado.
- Qué hacer con mensajes **duplicados**, **desordenados** o **perdidos**, que en planta son habituales: redes inestables, reconexiones y reintentos de QoS 1.
- Cómo evoluciona el contrato sin romper a los consumidores.
- Qué broker se usa.

## Opciones consideradas

**Formato del contrato:**

1. **JSON propio sobre MQTT 5**, con las buenas prácticas de Sparkplug (estado de conexión, números de secuencia) sin adoptar la especificación.
2. **Eclipse Sparkplug B:** especificación estándar para IIoT sobre MQTT, con topics fijos, carga útil en Protobuf y mensajes de nacimiento y muerte de cada nodo.
3. **Mensajes binarios propios** (Protobuf o CBOR).

**Broker:**

1. **Eclipse Mosquitto 2.1.**
2. **EMQX 6.**
3. **HiveMQ Community Edition.**

## Decisión

### 1. Protocolo y formato

- **MQTT 5.0.** Se usan el último mensaje de voluntad (*Last Will*), los mensajes retenidos, las sesiones persistentes y, cuando la API tenga varias instancias, las suscripciones compartidas (`$share/...`).
- Carga útil en **JSON UTF-8** con campos en `camelCase`. Las unidades forman parte del nombre del campo (`cycleTimeMs`, `throughputBoxesPerHour`).
- Marcas de tiempo en **ISO 8601 en UTC con milisegundos** (`2026-10-05T08:30:00.000Z`), generadas en origen.

### 2. Topics

```text
logicflows/v1/{siteId}/{cellId}/{kind}
```

| Segmento | Formato | Ejemplo |
|---|---|---|
| `v1` | Versión mayor del contrato | `v1` |
| `siteId` | Planta. `^[a-z0-9-]{1,32}$` | `demo` |
| `cellId` | Célula, única dentro de la planta. `^[a-z0-9-]{1,32}$` | `cell-01` |
| `kind` | Tipo de mensaje: `status`, `state` o `telemetry` | `state` |

La API se suscribe con comodines, por ejemplo `logicflows/v1/+/+/state`. Incluir la planta desde el principio evita un cambio incompatible cuando haya más de una.

### 3. Mensajes

| `kind` | Cuándo se publica | QoS | Retenido |
|---|---|---|---|
| `status` | Al conectar (`online: true`) y como *Last Will* al perder la conexión (`online: false`) | 1 | Sí |
| `state` | En cada transición de estado ([ADR-0003](0003-estados-de-la-paletizadora.md)) y en cada cambio de las alarmas activas | 1 | Sí |
| `telemetry` | Tras cada caja procesada y, como mínimo, cada 10 segundos | 0 | Sí |

**Campos comunes** a todos los mensajes:

| Campo | Tipo | Descripción |
|---|---|---|
| `schemaVersion` | entero | Versión del esquema del mensaje. Empieza en `1`. |
| `messageId` | UUID v7 | Identificador único del mensaje. |
| `siteId`, `cellId` | texto | Iguales a los del topic. |
| `sessionId` | UUID v7 | Identificador de la sesión del publicador. Cambia cada vez que el publicador arranca. |
| `seq` | entero ≥ 0 | Número de secuencia, creciente dentro de una sesión e independiente para cada tipo de mensaje: `state` y `telemetry` llevan su propia secuencia. No se usa en `status`. |
| `timestamp` | texto ISO 8601 | Momento en el que se generó el dato en origen. |

**`status`**: estado de la conexión.

```json
{
  "schemaVersion": 1,
  "messageId": "0199a1b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b",
  "siteId": "demo",
  "cellId": "cell-01",
  "sessionId": "0199a1b2-7c00-7000-8000-000000000001",
  "timestamp": "2026-10-05T08:00:00.000Z",
  "online": true
}
```

El mensaje de voluntad se registra al conectar con `online: false` y el mismo `sessionId`, así que su `timestamp` es el de la conexión, no el de la caída. La API usa su hora de recepción como momento de la desconexión.

**`state`**: estado de la célula y alarmas activas.

| Campo | Tipo | Descripción |
|---|---|---|
| `state` | enumerado | Estado según ADR-0003. |
| `previousState` | enumerado o `null` | Estado anterior. `null` en el primer mensaje de la sesión. |
| `event` | texto o `null` | Evento de ADR-0003 que provocó la transición. `null` si el mensaje solo actualiza las alarmas. |
| `waitingReason` | `STARVED`, `BLOCKED` o `null` | Obligatorio en `WAITING`; `null` en el resto. |
| `since` | texto ISO 8601 | Momento en el que se entró en el estado actual. |
| `activeAlarms` | lista | Alarmas activas: `code`, `severity` (`LOW`, `MEDIUM`, `HIGH` o `CRITICAL`), `message` y `raisedAt`. Lista vacía si no hay ninguna. |

```json
{
  "schemaVersion": 1,
  "messageId": "0199a1b2-8a00-7000-8000-000000000042",
  "siteId": "demo",
  "cellId": "cell-01",
  "sessionId": "0199a1b2-7c00-7000-8000-000000000001",
  "seq": 42,
  "timestamp": "2026-10-05T08:30:00.000Z",
  "state": "WAITING",
  "previousState": "RUNNING",
  "event": "starved",
  "waitingReason": "STARVED",
  "since": "2026-10-05T08:30:00.000Z",
  "activeAlarms": [
    {
      "code": "CONV-001",
      "severity": "LOW",
      "message": "Sin cajas en la entrada",
      "raisedAt": "2026-10-05T08:30:00.000Z"
    }
  ]
}
```

**`telemetry`**: producción y detalle de los componentes.

| Campo | Tipo | Unidad | Descripción |
|---|---|---|---|
| `boxesTotal` | entero ≥ 0 | cajas | Contador acumulado de cajas paletizadas. Solo crece. |
| `palletsTotal` | entero ≥ 0 | pallets | Contador acumulado de pallets completados. Solo crece. |
| `pallet.currentLayer` | entero ≥ 1 | capa | Capa en curso del pallet actual. |
| `pallet.layersPerPallet` | entero ≥ 1 | capas | Capas de un pallet completo. |
| `pallet.boxesInLayer` | entero ≥ 0 | cajas | Cajas colocadas en la capa en curso. |
| `pallet.boxesPerLayer` | entero ≥ 1 | cajas | Cajas de una capa completa. |
| `cycleTimeMs` | entero ≥ 0 o `null` | milisegundos | Duración del último ciclo completo. `null` si aún no hay ninguno. |
| `throughputBoxesPerHour` | número ≥ 0 | cajas por hora | Ritmo medio de los últimos 60 segundos, calculado en origen. |
| `robot.state` | `IDLE`, `MOVING` o `FAULT` | — | Estado del robot. |
| `conveyor.state` | `STOPPED`, `RUNNING` o `FAULT` | — | Estado de la cinta de entrada. |

```json
{
  "schemaVersion": 1,
  "messageId": "0199a1b2-8b00-7000-8000-000000000043",
  "siteId": "demo",
  "cellId": "cell-01",
  "sessionId": "0199a1b2-7c00-7000-8000-000000000001",
  "seq": 1187,
  "timestamp": "2026-10-05T08:30:04.200Z",
  "boxesTotal": 15234,
  "palletsTotal": 312,
  "pallet": {
    "currentLayer": 3,
    "layersPerPallet": 5,
    "boxesInLayer": 4,
    "boxesPerLayer": 8
  },
  "cycleTimeMs": 4200,
  "throughputBoxesPerHour": 820,
  "robot": { "state": "MOVING" },
  "conveyor": { "state": "RUNNING" }
}
```

### 4. Garantías de entrega

- **`state` y `status` con QoS 1 y retenidos.** Un cambio de estado no puede perderse, y un suscriptor nuevo recibe al instante el último estado y la conexión de cada célula.
- **`telemetry` con QoS 0 y retenido.** Los contadores son acumulados: si se pierde un mensaje, el siguiente trae el valor correcto. QoS 1 duplicaría el tráfico de control sin mejorar el dato.
- La API se conecta con **sesión persistente** (`cleanStart: false` y caducidad de sesión de 1 hora) y se suscribe con QoS 1. Si se reinicia, el broker le entrega los cambios de estado que se produjeron mientras estaba caída.

### 5. Duplicados, desorden y pérdidas

La API conserva, por célula y tipo de mensaje, la última sesión y el último `seq` procesados, y aplica estas reglas:

| Situación | Detección | Tratamiento |
|---|---|---|
| **Duplicado** (reintento de QoS 1) | Misma sesión y `seq` igual al último procesado | Se descarta sin aviso. |
| **Desordenado** | Misma sesión y `seq` menor que el último procesado | Se descarta y se registra un aviso: un dato antiguo no puede sobrescribir uno más reciente. |
| **Pérdida** | Misma sesión y salto en `seq` | Se procesa. En `state` se registra un aviso con el número de mensajes perdidos; en `telemetry` solo se contabiliza en una métrica, porque con QoS 0 las pérdidas son esperables. |
| **Reinicio del publicador** | `sessionId` distinto | Se acepta como nueva sesión si su `timestamp` es posterior al último procesado. |
| **Reinicio de contadores** | `boxesTotal` o `palletsTotal` disminuye | Se registra como reinicio de contadores; la producción se calcula por diferencias dentro de cada tramo. |

Los mensajes retenidos que el broker entrega al suscribirse se procesan con las mismas reglas, pero los ya procesados se descartan sin aviso: es lo esperado tras reiniciar la API.

Cada tipo de mensaje lleva su propia secuencia porque los mensajes retenidos de `state` y `telemetry` pueden llegar en cualquier orden al suscribirse. Con una secuencia compartida, una telemetría más reciente haría descartar un cambio de estado válido.

Se ordena por `seq` y no por `timestamp` porque los relojes de las máquinas pueden desviarse, mientras que la secuencia la genera un único publicador. El `timestamp` se usa para mostrar y almacenar los datos. La API también guarda su propia hora de recepción.

### 6. Validación

Todo mensaje se valida contra el esquema del contrato compartido (LF-21) antes de procesarlo. Un mensaje inválido o de un `schemaVersion` no soportado se descarta y se registra con su topic y el motivo, sin detener la suscripción. Los consumidores ignoran los campos que no conocen.

### 7. Versionado

- **Cambio compatible** (añadir un campo opcional, un valor nuevo que los consumidores pueden ignorar): se incrementa `schemaVersion` y se mantiene `v1` en el topic.
- **Cambio incompatible** (eliminar o renombrar un campo, cambiar su tipo o su significado): nueva versión mayor en el topic (`v2`). Durante la migración, los publicadores emiten en ambas versiones hasta que todos los consumidores hayan migrado.

### 8. Broker y seguridad

- **Eclipse Mosquitto 2.1**, desplegado como contenedor en el entorno local (LF-17).
- **Autenticación desde el Hito 1:** cada cliente tiene usuario y contraseña, y una lista de control de acceso limita a cada célula a publicar en sus propios topics y a la API a suscribirse. Las credenciales se inyectan por variables de entorno.
- **TLS** a partir del Hito 2, cuando el tráfico salga de la red local.

## Justificación

**JSON propio frente a Sparkplug B.** Sparkplug es el estándar para integrar sistemas SCADA de distintos fabricantes. Exige Protobuf, un espacio de topics fijo y un modelo de métricas genérico que dificulta leer y validar los mensajes, y el simulador, la API y el visor tendrían que implementar su gestión de estados de nacimiento y muerte. LogicFlows controla productores y consumidores, así que un contrato propio es más simple de implementar, depurar con `mosquitto_sub` y validar con tipos compartidos. Se toman de Sparkplug las ideas que resuelven problemas reales: estado de conexión con *Last Will*, sesión del publicador y números de secuencia.

**JSON frente a binario.** Cada célula publica unos pocos mensajes por segundo de menos de 1 KB. El ahorro de Protobuf o CBOR es irrelevante a esta escala, y la legibilidad acelera el desarrollo y el diagnóstico en planta.

**MQTT 5 frente a 3.1.1.** Mosquitto, la librería `mqtt` de Node.js y los brokers del mercado lo soportan. Aporta códigos de motivo en los errores, caducidad de sesión configurable y suscripciones compartidas para escalar la API sin cambiar el contrato.

**Contadores acumulados frente a un evento por caja.** Un evento por caja obligaría a garantizar entrega exactamente una vez para no perder ni contar dos veces. Con contadores acumulados, la pérdida y la duplicación de mensajes no alteran la producción calculada. Es la práctica habitual en telemetría industrial.

**Mosquitto frente a EMQX y HiveMQ.** Mosquitto es la implementación de referencia de Eclipse, ligera (unos pocos MB de memoria) y suficiente para cientos de células en un único nodo. EMQX aporta clúster, panel de control y motor de reglas, pero desde la versión 5.9 se distribuye con licencia BSL 1.1, que solo permite un nodo en producción sin licencia comercial. HiveMQ CE, basado en Java, necesita más recursos y su valor diferencial está en la edición comercial. La alta disponibilidad del broker se decidirá con la infraestructura del Hito 2.

## Alternativas descartadas

**Sparkplug B.** Aporta interoperabilidad inmediata con plataformas SCADA como Ignition. Se descarta porque su complejidad no aporta valor mientras LogicFlows controle ambos extremos. Será la opción preferente si hay que integrarse con sistemas de terceros.

**Mensajes binarios propios.** Reducen el tamaño y el coste de análisis, pero dificultan el diagnóstico y no son necesarios con este volumen.

**EMQX.** Es la opción natural si se necesita un clúster de brokers, puentes con otros sistemas o un motor de reglas, siempre que su licencia sea aceptable.

**HiveMQ Community Edition.** Opción válida y abierta, con más consumo de recursos que Mosquitto y sin ventajas para el alcance actual.

## Consecuencias

**Positivas:**

- Un contrato legible, con unidades explícitas, que el paquete compartido (LF-21) puede convertir en tipos y validación.
- La API conoce en todo momento el estado y la conexión de cada célula, incluso tras reiniciarse.
- Los duplicados, el desorden y las pérdidas tienen un tratamiento definido y observable.
- La planta forma parte del topic desde el principio.
- Mosquitto es trivial de ejecutar en local, en la CI y en contenedores.

**Costes y riesgos:**

- Los publicadores deben mantener `sessionId` y una secuencia por tipo de mensaje, y la API su último valor por célula y tipo.
- El `timestamp` del mensaje de voluntad no refleja el momento de la caída.
- Los mensajes retenidos de una célula dada de baja permanecen en el broker hasta que se borran explícitamente.
- La sesión persistente solo protege lo que el broker puede guardar: `max_queued_messages` está en 50 000, una hora con unas 20 células. El valor por defecto de Mosquitto, 1 000, se quedaba corto (LF-90).
- Mosquitto no ofrece clúster: un único nodo es un punto único de fallo hasta que se diseñe la alta disponibilidad en el Hito 2.

## Criterios de revisión

Esta decisión se revisará mediante un nuevo ADR si se cumple alguna de estas condiciones:

- Hay que integrarse con un SCADA o un sistema de terceros que espera Sparkplug B.
- El volumen supera los 1.000 mensajes por segundo o el tamaño de los mensajes afecta al ancho de banda disponible en planta.
- Se necesita alta disponibilidad del broker o puentes entre plantas.
- Hace falta registrar cada caja individualmente, por ejemplo por trazabilidad de producto.

## Actualización (7 de octubre de 2026): confirmar al broker después de guardar

Este ADR promete que un cambio de estado no se pierde: `state` y `status` van con QoS 1 y la API usa una sesión persistente. Al revisar la persistencia (LF-114) se vio un hueco. El cliente MQTT confirmaba cada mensaje (PUBACK) al recibirlo, antes de guardarlo. Si PostgreSQL no estaba disponible, el mensaje se registraba como error y se descartaba, y el broker ya no lo volvía a entregar.

**Alternativas** (LF-117):

1. **Confirmar después de guardar.** mqtt.js envía el PUBACK cuando termina `handleMessage`, y no lee el paquete siguiente hasta entonces. Si esa función espera a que el mensaje esté guardado, un fallo de PostgreSQL detiene la lectura, y el broker conserva los mensajes en la sesión.
2. **Reintentar en memoria sin cambiar la confirmación.** Cubre un corte breve de PostgreSQL, pero no una caída de la API con mensajes aún sin guardar.
3. **Guardar primero en disco** (un registro local) y después en PostgreSQL. Cubre todos los casos, pero es una pieza más que operar, y el broker ya cumple ese papel (ADR-0018).

**Decisión: la opción 1, con reintentos.**

- `TelemetryStream` encadena las escrituras de la persistencia, de una en una y en orden.
- La ingesta sustituye `handleMessage`: un mensaje QoS 1 se confirma cuando han terminado las escrituras pendientes.
- La persistencia no descarta un mensaje que no puede guardar. Lo reintenta con una espera que empieza en 0,5 s y se duplica hasta 30 s.
- La telemetría (QoS 0) no se confirma y no espera.

**Consecuencias.**

- Mientras PostgreSQL no está disponible, la API deja de leer del broker y **el tiempo real se detiene**. Es preferible a perder cambios de estado sin aviso: el histórico y los indicadores se calculan a partir de ellos, y la caída ya se ve en `/health/ready` y en los registros.
- El broker conserva los mensajes de la sesión durante una hora y hasta su límite de cola (LF-90). Una caída más larga perdería los más antiguos, igual que una caída de la API.
- Si la API cae con un mensaje recibido y sin guardar, no lo ha confirmado: el broker lo vuelve a entregar al reconectar. La restricción única de la base de datos evita guardarlo dos veces (ADR-0007).
- Una prueba de integración deja PostgreSQL sin poder guardar cambios de estado, publica uno y comprueba que se guarda al recuperarse.

## Referencias

- [Especificación MQTT 5.0, OASIS](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
- [Especificación Eclipse Sparkplug 3.0](https://sparkplug.eclipse.org/specification/)
- [Eclipse Mosquitto](https://mosquitto.org/)
- [Licencia de EMQX](https://www.emqx.com/en/content/license-faq)
- [RFC 9562: UUID versión 7](https://www.rfc-editor.org/rfc/rfc9562)
