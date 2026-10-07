# ADR-0016: Almacenamiento y retención del histórico

- **Estado:** Aceptado. En la demo, las ventanas las fija [ADR-0019](0019-datos-de-la-demo.md). Actualizado el 7 de octubre de 2026 (LF-114)
- **Fecha:** 2026-10-03
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-76

## Contexto

El Hito 4 muestra el histórico de producción, estados y alarmas, con indicadores de planta por periodo (LF-78 a LF-81). Hoy, cada mensaje aceptado se guarda en PostgreSQL (ADR-0007). La producción de un periodo se calcula al consultar, sumando las diferencias entre muestras consecutivas de cada sesión (ADR-0004).

El plan inicial dejaba abierta la elección del almacenamiento del histórico, con MongoDB como candidata. Antes de decidir se midió con datos, con el histórico simulado de LF-77 y con un spike en GitHub Actions ([`spike/LF-76-medicion-historico`](https://github.com/amariner/logicflows/tree/spike/LF-76-medicion-historico), que no se fusiona). Se usó PostgreSQL 18 con 90 días de telemetría, una muestra cada 10 s por célula, como publica el histórico simulado:

| 90 días de telemetría | 1 célula | 5 células |
|---|---|---|
| Muestras | 777 601 | 3 888 005 |
| Tamaño (datos + índices) | 239 MB | 1,2 GB |
| Consulta actual de producción, 30 días | 468 ms | 772 ms |
| Consulta actual de producción, 1 día | 439 ms | 693 ms |
| Agregados por hora: filas y tamaño | 2 161 (240 kB) | 10 805 (1,5 MB) |
| Agregados por hora: producción de 30 días | 0,14 ms | 0,38 ms |
| Construir los agregados de 90 días | 0,6 s | 4,8 s |

Las mediciones dejan dos conclusiones:

1. **La consulta actual no escala con el histórico.** Para calcular las diferencias recorre todas las muestras de la célula anteriores al final del periodo, así que pedir un día cuesta lo mismo que pedir un mes. Con 90 días ya supera los 300 ms que pide LF-80.
2. **El volumen no es un problema para PostgreSQL.** Son unos 2,7 MB por célula y día en bruto, y casi nada agregado. La API, además, ya ingiere unos 9 000 mensajes por célula y día sin dificultad (LF-77).

## Opciones consideradas

1. **PostgreSQL con agregados por hora y retención del dato en bruto.** Las consultas por periodo leen los agregados, y el dato en bruto se conserva un tiempo limitado.
2. **PostgreSQL con particionado por tiempo o con TimescaleDB.** Particiones por día o por mes que se borran enteras, o *hypertables* con agregados continuos.
3. **MongoDB con colecciones de series temporales** para la telemetría, y PostgreSQL para el resto.

## Decisión

1. **El histórico sigue en PostgreSQL,** sin otra base de datos ni extensiones.
2. **Agregados por célula y hora** (LF-79): cajas, pallets, segundos en cada estado y número de alarmas por gravedad. Se recalculan a partir del dato en bruto de las horas afectadas:
   - al guardar un mensaje se anota su hora como pendiente;
   - un proceso periódico recalcula las horas pendientes con un *upsert*.

   Es idempotente y tolera mensajes repetidos, desordenados o antiguos, como los de un histórico cargado, y varias réplicas (ADR-0007).
3. **Las consultas por periodo usan los agregados** (LF-80). La resolución mínima del histórico es la hora. El estado actual y la producción en curso siguen saliendo del tiempo real.
4. **Retención:**
   - **Telemetría en bruto:** 30 días.
   - **Cambios de estado y de conexión:** 365 días. Son unos cientos de filas al día y sirven para revisar una incidencia concreta.
   - **Agregados por hora:** sin límite. Ocupan unos 1 MB por célula y año.

   El borrado del dato en bruto va por lotes, para no bloquear la ingesta.
5. **Copias de seguridad de PostgreSQL** antes de borrar nada (LF-82): desde ahora, el histórico agregado no se puede reconstruir desde las células.

## Justificación

- **Resuelve el problema medido** con el menor cambio posible: tres órdenes de magnitud más rápido, con una tabla de unos cientos de kilobytes.
- **Sin operación nueva.** Otra base de datos (opción 3) supone otro servicio en Railway, otra copia de seguridad, otro cliente en la API y otra tecnología para un equipo de cuatro personas. Las mediciones no muestran ningún límite de PostgreSQL que lo justifique.
- **Coherente con lo que ya funciona.** Idempotencia por restricciones únicas, migraciones aditivas con Drizzle (ADR-0007) y la misma base de datos para todo.
- **Medido, no supuesto.** El spike puede repetirse con más células o más días cuando haga falta revisar la decisión.

## Alternativas descartadas

- **Particionado o TimescaleDB (opción 2).** El particionado hace barato borrar meses enteros y TimescaleDB trae agregados continuos, pero con 30 días en bruto y pocas células el borrado por lotes basta. TimescaleDB exigiría además una imagen de PostgreSQL propia en Railway. Se reconsiderará con decenas de células.
- **MongoDB (opción 3).** Sus series temporales están pensadas para volúmenes muy superiores. Aquí añadiría un segundo almacén con su consistencia, sus copias y su operación, sin una necesidad medida. Era la candidata del plan inicial: las mediciones la descartan por ahora.
- **Mantener la consulta en bruto, acotándola al periodo.** Leer solo el periodo y la muestra anterior a su inicio de cada sesión reduciría el coste a lo pedido. Aun así seguiría leyendo cientos de miles de filas por mes y no resolvería los indicadores por estado. Los agregados resuelven las dos cosas.

## Consecuencias

- **Una tabla de agregados, una de horas pendientes y un proceso periódico** en la API (LF-79). Con varias réplicas, el recálculo es idempotente: si dos réplicas recalculan la misma hora, el resultado es el mismo.
- **La resolución del histórico es la hora.** Para el detalle de los últimos 30 días queda el dato en bruto.
- **El dato en bruto de más de 30 días desaparece.** Cambiar cómo se calcula un agregado solo afectará a los últimos 30 días. Hace falta revisar bien los agregados antes de que caduque el dato en bruto.
- **Hay que hacer copias de seguridad** (LF-82). Hasta ahora, perder la base de datos solo costaba el estado actual, que las células vuelven a enviar.
- **La consulta de producción de LF-33 pasará a los agregados** en LF-80, con el mismo contrato de la API.

## Criterios de revisión

- Más de unas 20 células, o una consulta de agregados por encima de 50 ms.
- Necesidad de conservar el dato en bruto más de 30 días, por auditoría o por análisis.
- El tamaño de la base de datos se acerca al límite de coste acordado en Railway.
- Aparece una necesidad que PostgreSQL no cubre bien, como búsquedas de texto sobre eventos o esquemas muy variables por célula.

## Actualización (7 de octubre de 2026): el mensaje y su marca, en la misma transacción

La retrospectiva del Hito 4 señaló que la ingesta guardaba el mensaje y marcaba su hora como pendiente en dos operaciones (LF-114). Si la API caía o PostgreSQL fallaba entre las dos, el mensaje quedaba guardado y su hora no se volvía a agregar.

**Alcance real del hueco.** Una hora no deja de estar pendiente hasta que termina, así que en una hora en curso la marca perdida la repone el siguiente mensaje. El hueco solo afecta a los mensajes que llegan tarde a una hora ya cerrada, como la reentrega de una célula que estuvo desconectada o un histórico cargado. En ese caso el agregado de esa hora no incluye el mensaje, sin ningún aviso más que el error en el registro.

**Alternativas.**

1. **Transacción** con el `insert` y la marca. Cuesta un `BEGIN` y un `COMMIT` más por mensaje, unos 9 000 al día por célula.
2. **Una sola sentencia** con una CTE que inserta y marca. Ahorra esas idas y vueltas, pero exige SQL a mano para los tres tipos de mensaje.
3. **Reconciliación periódica** que compare la hora de recepción del dato en bruto con la de cálculo del agregado. Necesita otro índice y otro proceso.

**Decisión.**

- **Transacción (opción 1).** Es el cambio más pequeño y su coste en la ingesta es despreciable con el volumen actual. Si la marca falla, el mensaje tampoco se guarda: el dato en bruto y el agregado no se contradicen nunca.
- **Versión en cada hora pendiente.** Con la transacción, la marca lleva la hora de PostgreSQL de su sentencia, anterior al `COMMIT`. El agregador podía leer el dato en bruto antes de ese `COMMIT` y después quitar la hora, porque su marca parecía anterior al cálculo. Ahora cada marca sube la versión de la hora, y el agregador solo la quita si la versión es la que leyó. Ya no depende de los relojes.
- Lo cubren dos pruebas de integración: un fallo al marcar no deja el mensaje guardado, y una hora que se vuelve a marcar mientras se calcula sigue pendiente.

**Lo que no resuelve.** La API confirma cada mensaje al broker al recibirlo, antes de guardarlo. Si PostgreSQL no está disponible, el mensaje se pierde entero, no solo su marca. Se analiza aparte en LF-117.
