# ADR-0021: Calendario de turnos y tiempo planificado

- **Estado:** Aceptado
- **Fecha:** 2026-10-08
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-121

## Contexto

La disponibilidad se calcula sobre el **tiempo planificado**: el tiempo en que se pretendía producir ([indicadores de planta](../indicadores-de-planta.md)). Hoy LogicFlows no sabe cuándo se pretendía producir, así que lo aproxima con el estado de la célula: una parada ordenada (`STOPPED`) se excluye, porque suele ser un fin de turno, un cambio de referencia o un mantenimiento previsto.

Esa aproximación tiene un fallo conocido: **una célula detenida en mitad de un turno no resta disponibilidad**. Si el operario la para durante dos horas sin motivo, el indicador sigue al 100 %. Es la mayor limitación de los indicadores y la primera que verá un jefe de planta.

El Hito 6 (LF-120) introduce un **calendario de turnos** por planta para resolverlo. Hay que decidir:

1. Dónde vive el calendario y quién lo cambia.
2. Su modelo: turnos semanales, excepciones como festivos, zona horaria y cambio de hora.
3. Cómo se aplica al histórico, que se guarda en agregados por célula y hora ([ADR-0016](0016-almacenamiento-del-historico.md)).
4. Qué pasa con las horas sin calendario y con el histórico anterior a él.

Restricciones:

- **La resolución del histórico es la hora.** Los agregados guardan los segundos que la célula pasó en cada situación en cada hora, pero no en qué minuto.
- **El histórico no se reescribe.** Un indicador que ya se enseñó o se descargó en CSV no debe cambiar porque alguien edite hoy el calendario.
- **Consumo mínimo** en la demo ([ADR-0019](0019-datos-de-la-demo.md)): nada de servicios nuevos.
- **Compatibilidad:** sin calendario, los indicadores deben dar exactamente lo mismo que hoy.

## Opciones consideradas

**Dónde vive el calendario:**

1. **Tablas de PostgreSQL** editadas a través de la API, con versiones por fecha de entrada en vigor.
2. **Fichero versionado en el repositorio** (YAML por planta), cargado por la API al arrancar.
3. **Calendario externo** (iCalendar, Google Calendar o el sistema de RR. HH. de la planta), consultado por la API.

**Cómo se aplica al histórico:**

- **A.** Al consultar: los agregados no cambian, y la API decide hora a hora si era tiempo de turno.
- **B.** Al agregar: cada agregado guarda también los segundos planificados de esa hora.
- **C.** Al consultar, pero desde el registro de cambios de estado con su hora exacta, sin pasar por los agregados.

## Decisión

### 1. El calendario vive en PostgreSQL, por planta y con versiones

- **Una versión del calendario** por planta tiene una **fecha de entrada en vigor**, una zona horaria IANA (`Europe/Madrid`) y sus turnos semanales. Está vigente desde su fecha hasta la entrada en vigor de la siguiente.
- **Un turno** es un día de la semana, una hora de inicio, una hora de fin y un nombre («Mañana», «Tarde», «Noche»). Si termina antes de empezar, cruza la medianoche: «Noche, lunes 22:00–06:00» va del lunes a las 22:00 al martes a las 06:00.
- **Las excepciones** son días concretos de una planta sin turnos: festivos, vacaciones o paradas por mantenimiento. Un turno que empieza en un día de excepción no cuenta.
- **Los turnos empiezan y terminan en horas en punto** (06:00, 14:00, 22:00). Es la resolución del histórico.
- **Los turnos de una versión no se solapan.** La API lo valida.

### 2. El pasado no se reescribe

- **Una versión nueva entra en vigor como pronto mañana,** en la zona horaria de la planta. Las versiones vigentes y pasadas no se modifican ni se borran; una versión futura sí se puede sustituir.
- **Las excepciones de días pasados o de hoy no se crean ni se borran.**
- Así, los indicadores de cualquier periodo ya cerrado son siempre los mismos, y un CSV descargado ayer coincide con el de hoy.

### 3. Se aplica al consultar, hora a hora (opción A)

Para cada hora del periodo, la API mira la versión vigente y las excepciones, en la hora local de la planta, y decide si es **hora de turno**:

| Situación de la célula | En hora de turno | Fuera de turno |
|---|---|---|
| `RUNNING` | En producción | En producción (horas extra) |
| `STARTING`, `PAUSED`, `WAITING`, `FAULT`, `EMERGENCY_STOP` | Parada, por causa | Parada, por causa |
| `STOPPED` | **Parada: «Detenida en turno»** | Fuera de producción |
| Sin datos | Se excluye | Se excluye |

- **Solo cambia `STOPPED` dentro de un turno,** que pasa a ser una parada con su propia causa, «Detenida en turno». Es exactamente el fallo descrito en el contexto.
- **Fuera de turno se mantiene la regla de hoy.** Si la célula produce, son horas extra: cuentan en producción y como planificadas, y la disponibilidad no supera el 100 %. Si falla, la avería resta, porque la célula estaba trabajando.
- **Sin calendario, todas las horas son «fuera de turno»,** y los indicadores dan lo mismo que hoy, bit a bit. Es el caso de las plantas sin calendario y de todo el histórico anterior a la primera versión.
- **El cambio de hora** sale solo: las horas del histórico están en UTC y se convierten a la hora local de la planta. Un turno de noche de 22:00 a 06:00 dura 9 horas la noche en que se retrasa la hora y 7 la noche en que se adelanta, como en la planta real.

### 4. Los agregados cuentan las paradas `STOPPED`

Para la causa «Detenida en turno» hace falta saber cuántas veces empezó, además de sus segundos. El agregador por hora (LF-79) pasa a anotar también las paradas `STOPPED` en sus paradas por causa. Se calcula para todas las horas, y la API solo lo usa en las de turno. No hace falta recalcular el histórico: ninguna hora anterior a la primera versión del calendario es de turno.

### 5. API y permisos

- `GET /api/v1/sites/{siteId}/calendar`: versión vigente, versiones futuras y excepciones. Rol `viewer`.
- `PUT /api/v1/sites/{siteId}/calendar/versions/{effectiveFrom}`: crea o sustituye una versión futura. `DELETE` la borra si aún es futura. Rol `admin`.
- `PUT` y `DELETE /api/v1/sites/{siteId}/calendar/exceptions/{date}`: excepciones de días futuros. Rol `admin`.
- **Quién y cuándo:** cada versión y cada excepción guardan el usuario (`sub` y nombre del token) y la hora en que se crearon. Las versiones vigentes y pasadas no se modifican, así que la tabla es el propio registro de cambios. Además, cada cambio se escribe en el log estructurado como evento de auditoría (ver [ADR-0022](0022-reconocimiento-de-alarmas.md)).
- Los indicadores de `GET …/history` y el CSV añaden el tiempo de turno del periodo (`shiftSeconds`), y la causa nueva aparece en las paradas.

### 6. La demo

Producción tiene un calendario para la planta `demo`, cargado por una migración de datos: dos turnos de lunes a viernes, «Mañana» de 06:00 a 14:00 y «Tarde» de 14:00 a 22:00. Las noches y los fines de semana quedan fuera de turno, así que la demo enseña las dos reglas. Como el guion diario ([ADR-0019](0019-datos-de-la-demo.md)) se repite igual todos los días, el fin de semana sus paradas siguen contando por la regla de fuera de turno.

## Justificación

**PostgreSQL frente a un fichero versionado (opción 2).** Un fichero en el repositorio es sencillo, revisable en una pull request y no necesita pantallas. Pero el calendario es un dato de operación, no de despliegue: lo cambia el jefe de planta cuando hay un festivo o un turno extra, no un desarrollador con un despliegue. Con varias plantas, un fichero mezclaría la configuración de clientes distintos en el repositorio del producto. PostgreSQL ya está, tiene copias de seguridad preparadas (ADR-0017) y las migraciones aditivas lo cubren (ADR-0007).

**PostgreSQL frente a un calendario externo (opción 3).** Sería lo ideal en una planta con su sistema de turnos, pero hoy no hay ninguno con el que integrarse. Añadiría una dependencia de red en cada consulta, credenciales y un caso de error más. Cuando un cliente lo pida, un proceso puede importar su calendario a estas tablas sin cambiar cómo se calculan los indicadores.

**Al consultar (A) frente a al agregar (B).** Guardar los segundos de turno en cada agregado haría la consulta un poco más simple, pero ata los agregados al calendario: cualquier cambio obligaría a recalcular horas, y el dato en bruto solo se conserva 30 días (ADR-0016). Al consultar, el calendario es una tabla pequeña (unas decenas de filas por planta) y decidir si una hora es de turno cuesta microsegundos. Mirar el calendario de 30 días son 720 horas por célula, nada frente a la lectura de los agregados.

**Al consultar desde los agregados (A) frente a desde los cambios de estado (C).** Los cambios de estado tienen la hora exacta y permitirían turnos que empiezan a las 06:30. Pero volverían a la consulta lenta que ADR-0016 eliminó, y duplicarían el cálculo de los indicadores. Los turnos en horas en punto cubren la mayoría de las plantas, y la restricción se puede levantar más adelante (ver criterios de revisión).

**Versiones con fecha frente a un calendario editable sin más.** Si el calendario se edita en el sitio, cambiar hoy el turno de tarde cambia la disponibilidad de todo el mes pasado. Un jefe de planta que compare el informe de la semana pasada con la pantalla vería cifras distintas sin que nada haya pasado en la planta. Las versiones con fecha de entrada en vigor evitan esa clase de errores silenciosos con muy poco código: una columna y una comprobación.

**Cambiar solo `STOPPED` dentro del turno.** Es el cambio mínimo que corrige el problema y deja intactas las demás reglas, ya probadas con los ejemplos de los indicadores. Contar todo el tiempo fuera de turno como no planificado, incluida una avería a las 3 de la madrugada, ocultaría las averías de las horas extra.

## Alternativas descartadas

- **Fichero versionado (opción 2).** Se reconsiderará si los calendarios resultan ser estables y solo los cambia el equipo, por ejemplo en un despliegue para una sola planta.
- **Calendario externo (opción 3).** Se hará como importación cuando un cliente tenga un sistema de turnos con el que integrarse.
- **Segundos de turno en los agregados (B).** Solo compensaría con cientos de células, si mirar el calendario al consultar se notara en el tiempo de respuesta.
- **Cálculo desde los cambios de estado (C).** Necesario si se aceptan turnos que no empiezan en hora en punto (ver criterios de revisión).
- **Turnos por célula.** En una planta, las células suelen seguir el turno de la planta. Si una célula trabaja con otro horario, se añadirá un calendario por célula que sustituya al de la planta, con el mismo modelo.
- **Paradas planificadas dentro del turno** (bocadillo, limpieza, cambio de referencia). Son el siguiente refinamiento habitual del OEE. Hoy se ven como paradas por su causa (`PAUSED`, `STOPPED`). Se modelarán como franjas sin producción dentro del turno si un cliente lo pide.

## Consecuencias

**Positivas:**

- La disponibilidad refleja de verdad una célula parada en mitad de un turno.
- Los indicadores de un periodo cerrado no cambian nunca, ni con el calendario ni con el tiempo.
- Las plantas sin calendario y el histórico anterior siguen igual, sin migrar nada.
- La demo enseña turnos, horas extra y fines de semana con los datos que ya tiene.

**Costes y riesgos:**

- **Tres tablas nuevas** (versiones, turnos y excepciones) con migración aditiva, y pantallas para verlas y editarlas (LF-124, LF-127).
- **El agregador cambia** para contar las paradas `STOPPED`. Es aditivo: una causa más en el mismo campo.
- **Los turnos solo empiezan en horas en punto.** Una planta con turnos a las 06:30 tendría que redondear, con un error de hasta media hora por turno.
- **Corregir un error del calendario de hoy no es posible.** Si se olvidó un festivo, ese día cuenta como turno. Se asume para no reescribir el histórico. Si se vuelve un problema, se permitirá corregir el día en curso dejando constancia de quién lo corrigió.
- **Las zonas horarias con desfase de media hora** (India, partes de Australia) no encajan con horas en punto. Ya era una limitación del histórico por días (`time-zone.ts`).

## Criterios de revisión

- Un cliente necesita turnos que no empiecen en hora en punto: se pasaría a calcular desde los cambios de estado (C) o a agregados de 15 minutos.
- Un cliente tiene un sistema de turnos propio: se añade una importación.
- Hacen falta paradas planificadas dentro del turno para un OEE completo.
- Más de unas 50 células por planta, o la consulta del histórico supera los 300 ms de LF-80 por mirar el calendario.

## Referencias

- [Indicadores de planta](../indicadores-de-planta.md)
- [ADR-0016: Almacenamiento y retención del histórico](0016-almacenamiento-del-historico.md)
- [ADR-0019: Datos de la demo](0019-datos-de-la-demo.md)
- ISO 22400-2: indicadores clave de la gestión de operaciones de fabricación (tiempo planificado de ocupación)
- [Base de datos de zonas horarias de IANA](https://www.iana.org/time-zones)
