# ADR-0019: Datos de la demo: guion diario y ventana fija

- **Estado:** Aceptado
- **Fecha:** 2026-10-04
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-94

## Contexto

LogicFlows se presenta a posibles compradores. Producción ejecuta una célula simulada en Railway, en el plan Hobby, y debe consumir lo mínimo. Además, la base de datos no debe crecer, y los datos deben parecer vivos: un comprador tiene que ver una célula que produce, se para por motivos reconocibles y deja un histórico creíble.

Hoy no se cumple:

| Medida | Valor | Fuente |
|---|---|---|
| Volumen de PostgreSQL | 258 MB a los 3 días de producción | `railway volume list`, 4 de octubre de 2026 |
| Telemetría en directo | Una muestra por caja (4 s), unas 21 600 filas por célula y día | Simulador (LF-25) |
| Retención | Apagada: se guarda todo, a la espera de las copias de seguridad (ADR-0016) | `.railway/railway.ts` |
| Copias de seguridad | No se activan en la demo | ADR-0017 |
| Agregados por hora y avisos enviados | Ninguna retención los borra | `RetentionService`, `push_notified_alarms` |
| Simulador | Escenario `normal`, sin incidencias ni semilla. Las alarmas se provocan a mano cambiando el escenario | Demo del Hito 3 |

Dos detalles del simulador condicionan la decisión:

- **La semilla no hace repetible el modo en directo.** Los temporizadores reales deciden en qué orden se consumen los números aleatorios. Solo el histórico simulado, con su reloj virtual, da siempre la misma secuencia.
- **Nada depende de la hora del día.** El escenario `turno` es un conjunto de frecuencias, no un turno con horario.

## Opciones consideradas

1. **Dejarlo como está:** el sistema real con retención larga (30 días en bruto, 365 de estados) o sin retención.
2. **Fixture puro reproducido:** un conjunto de datos fijo en el repositorio, que la API sirve desplazado a la fecha de hoy. El tiempo real reproduce el fixture en bucle y no se guarda nada.
3. **Guion diario y ventana fija:** el sistema real sigue funcionando de extremo a extremo, pero:
   - lo que pasa cada día lo fija un guion en el repositorio;
   - la base de datos solo guarda una ventana corta de cada tabla.

## Decisión

**Guion diario y ventana fija (opción 3).**

1. **Guion diario.** Un fichero del simulador fija, para cada día, a qué hora local (`Europe/Madrid`) ocurre cada incidencia y cuánto dura. Incluye esperas por falta de cajas o por salida ocupada, pausas del operario, fallos del robot y alguna parada de emergencia. El simulador lo sigue con un escenario nuevo, `guion`, y lo repite cada día. Si arranca a media jornada, entra en el punto del guion que corresponde a esa hora.
   - **Algunas alarmas graves al día,** a horas laborables, para que una demo pueda enseñar un aviso en el móvil sin tocar Railway.
   - **La variación del ciclo y las cajas siguen la semilla.** Las incidencias las fija el reloj, no el azar, así que se repiten igual aunque el simulador se reinicie.
2. **Ventana fija.** La retención horaria de la API acota todas las tablas que crecen:

   | Tabla | Ventana | Para qué basta |
   |---|---|---|
   | Telemetría en bruto | 2 días | El tiempo real, los extremos de un periodo y recalcular las horas recientes |
   | Estados y conexiones | 31 días | El registro de estados y alarmas de los periodos del visor (hoy, 7 y 30 días) |
   | Agregados por hora | 31 días | Los indicadores de los mismos periodos |
   | Avisos ya enviados | 1 día | Evitar avisos repetidos, que solo se miran durante 15 minutos |

   Con esta ventana, la base de datos de una célula se queda en unas decenas de megabytes y deja de crecer.
3. **Carga inicial de la ventana.** Cuando la base de datos está vacía, el histórico simulado carga los 31 días con el mismo guion. Así, el periodo de 30 días no sale vacío tras un despliegue nuevo. Es un paso documentado del despliegue, no algo que el simulador haga solo en cada arranque, porque repetirlo duplicaría la producción.
4. **Todo es configuración.** Las ventanas son variables de la API, y el escenario y la semilla, del simulador. Producción las declara en `.railway/railway.ts`. Una planta real volvería a las ventanas de ADR-0016 sin cambiar código.

## Justificación

- **Se enseña lo que se vende.** El comprador ve la tubería real: la célula publica por MQTT, la API valida y guarda, el visor y el móvil reciben en directo y el histórico se calcula de los mismos datos. Con un fixture servido por la API, el sistema de la demo no sería el que se compra.
- **Parece vivo y es predecible.** Las incidencias llegan a horas creíbles y se repiten cada día. Quien prepara la demo sabe qué va a pasar, por ejemplo una parada de emergencia a media mañana, y los indicadores de cada día son parecidos sin ser una copia evidente, porque el ciclo varía con la semilla.
- **El tamaño es constante y pequeño.** Lo que más ocupa, la telemetría en bruto, se queda en dos días. Los agregados y los estados de 31 días son pocos kilobytes por célula y día.
- **El cambio es pequeño.** La retención ya existe (ADR-0016): se le añaden los agregados y los avisos enviados. El histórico simulado ya sabe cargar días pasados (LF-77).

## Alternativas descartadas

- **Dejarlo como está (opción 1).** Sin retención, el volumen crece sin límite. Con la de ADR-0016, se estabiliza en cientos de megabytes por célula y sigue sin dar un comportamiento predecible para una demo.
- **Fixture puro (opción 2).** No escribe nada, pero exige un camino de lectura distinto en la API y un reproductor en el tiempo real. El histórico y el directo dejarían de salir de los mismos datos, y lo que se enseña dejaría de ser el producto. Se reconsideraría si la demo tuviera que funcionar sin base de datos.

## Consecuencias

- **Recalcular el histórico solo es posible para los dos últimos días,** los que conservan la telemetría en bruto. En la demo no importa: el guion y la semilla permiten regenerar cualquier periodo.
- **`/production` y `/events` solo responden dentro de la ventana:** 2 días de telemetría en bruto para los extremos de un periodo y 31 de estados. El visor solo pide periodos dentro de ella.
- **ADR-0016 sigue vigente para una planta real.** Sus ventanas (30 días en bruto y 365 de estados, agregados sin límite) vuelven con la configuración, y entonces conviene activar las copias de ADR-0017.
- **El escenario `normal` deja de ser el de producción.** Las demos ya no necesitan cambiar `SIMULATOR_SCENARIO` para provocar alarmas. El guion de la demo del Hito 3 se actualiza.
- **El consumo de memoria** (Keycloak usa unos 750 MB de 1,1 GB) se trata aparte, en LF-96: no depende de los datos.

## Criterios de revisión

- **Datos reales:** LogicFlows recibe datos de una planta. Se vuelve a las ventanas de ADR-0016 y se activan las copias de ADR-0017.
- **Periodos más largos:** el visor necesita enseñar más de 30 días. Se amplía la ventana de los agregados, que ocupan muy poco.
- **Demo sin base de datos:** hace falta enseñarla sin PostgreSQL, por ejemplo sin conexión. Entonces se reconsideraría el fixture puro.
