# ADR-0018: Mensajería sin Kafka por ahora

- **Estado:** Aceptado
- **Fecha:** 2026-10-03
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-89

## Contexto

El plan dejaba para el Hito 4 una pregunta abierta: si el volumen lo justificaba, añadir Kafka entre las células y la API. Hoy, las células publican por MQTT en Mosquitto (ADR-0004). La API se suscribe con una sesión persistente, valida cada mensaje y lo guarda en PostgreSQL (ADR-0007), que también guarda el histórico agregado (ADR-0016).

Las razones habituales para poner un registro de eventos como Kafka entre el broker y quien consume son:

1. **Volumen:** más mensajes de los que un consumidor puede procesar.
2. **Varios consumidores independientes,** cada uno a su ritmo.
3. **Volver a procesar** el pasado, por ejemplo tras corregir un cálculo.
4. **No perder datos** mientras el consumidor está caído.

Con el Hito 4 ya hay mediciones para cada una:

| Medida | Valor | Fuente |
|---|---|---|
| Mensajes de una célula en directo | Unos 0,3 por segundo: una telemetría por caja (4 s), más los cambios de estado | Simulador (LF-25, LF-30) |
| Mensajes de una célula al día | Unos 9 000 a 22 000, según el escenario | LF-77 y ADR-0016 |
| Ingesta comprobada de una API | 272 813 mensajes en unos 4 minutos, unos 1 100 por segundo, en local | Histórico simulado de 30 días, 3 de octubre de 2026 |
| Umbral de revisión de ADR-0004 | 1 000 mensajes por segundo | ADR-0004 |
| Margen | Unas 3 000 células simuladas por instancia de la API antes de llegar al umbral | Cálculo con las cifras anteriores |

## Opciones consideradas

1. **Seguir con MQTT y PostgreSQL,** reforzando lo que falte.
2. **Kafka entre el broker y la API:** un puente MQTT → Kafka, y la API como consumidor de Kafka.
3. **Redpanda en lugar de Kafka,** compatible con su protocolo y más ligero de operar.

## Decisión

**Seguir con MQTT y PostgreSQL (opción 1),** sin Kafka ni Redpanda. Cada motivo para un registro de eventos ya está cubierto, o no aplica todavía:

| Motivo | Cómo se cubre hoy |
|---|---|
| Volumen | Unas 3 000 veces por debajo del umbral, y la API admite varias instancias (LF-47) |
| Varios consumidores | Uno solo, la API. Otro consumidor puede suscribirse al broker con su propia sesión |
| Volver a procesar | El dato en bruto está en PostgreSQL (30 días, ADR-0016). Los agregados se recalculan marcando sus horas como pendientes |
| No perder datos con la API caída | Sesión persistente de 1 hora con QoS 1 (ADR-0004). Al medirlo para este ADR se vio que Mosquitto solo guardaba 1 000 mensajes; ahora guarda 50 000, unas 20 células durante una hora (LF-90) |

## Justificación

- **Las mediciones no lo justifican.** El volumen es tres órdenes de magnitud menor que el que motiva Kafka, y la ingesta ya probada tiene un margen enorme.
- **Coste de operar.** Kafka o Redpanda es otro servicio con estado en Railway, con su volumen, sus copias de seguridad, sus particiones y su monitorización, para un equipo de cuatro personas. Además, otro salto entre la célula y el visor.
- **Lo que sí faltaba era barato.** El hueco real era la cola del broker durante una caída de la API, y se resolvió con una línea de configuración y una prueba.

## Alternativas descartadas

- **Kafka (opción 2).** Daría retención, varios consumidores y relectura. Hoy no hay un segundo consumidor ni un volumen que lo pida, y PostgreSQL ya permite releer los últimos 30 días.
- **Redpanda (opción 3).** Más sencillo que Kafka y con el mismo protocolo, pero sigue siendo un servicio con estado más. Si algún día hace falta un registro de eventos, será la primera candidata.

## Consecuencias

- **La arquitectura no cambia:** célula → MQTT → API → PostgreSQL.
- **El broker es la cola.** Su capacidad (`max_queued_messages`) se revisa cuando crezca el número de células, y se vigila con las métricas del broker (ADR-0013).
- **Releer más allá de 30 días** no será posible cuando se active la retención del dato en bruto. Se acepta: los agregados por hora y los cambios de estado de 365 días cubren el análisis del Hito 4.

## Criterios de revisión

- **Volumen:** más de 1 000 mensajes por segundo sostenidos (el umbral de ADR-0004), o una sola instancia de la API sin dar abasto.
- **Varios consumidores:** aparece un consumidor que necesita los mensajes a su ritmo y con historia propia, como un sistema de terceros, un MES o un modelo de detección de anomalías.
- **Releer:** hace falta volver a procesar más de 30 días de dato en bruto.
- **Planta:** se piden garantías de entrega más allá de una hora de caída de la API.
