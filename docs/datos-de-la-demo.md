# Datos de la demo: generación, mantenimiento y consumo

Producción es una demo para posibles compradores ([ADR-0019](adr/0019-datos-de-la-demo.md)). Debe parecer viva y comportarse igual cada día, la base de datos no puede crecer y el consumo tiene que ser el mínimo. Este documento reúne cómo se genera el contenido de la demo, cómo se carga y se mantiene, cómo se mide y lo que ha costado aprenderlo. El despliegue en general está en [Despliegue en Railway](despliegue.md).

## Cómo se generan los datos

El contenido de la demo sale del sistema real de extremo a extremo: simulador → broker → API → PostgreSQL → visor. No hay ningún fixture servido por la API: así la demo enseña la tubería de verdad.

- **El guion diario.** `SIMULATOR_SCENARIO=guion` y `SIMULATOR_SEED=7`. Cada día repite el guion de [`apps/simulator/src/guion-diario.ts`](../apps/simulator/src/guion-diario.ts), con incidencias a hora fija de Madrid: esperas por falta de cajas o por salida ocupada, pausas del operario, fallos del robot y una parada de emergencia. Las alarmas graves llegan a las 9:47, 11:15 (parada de emergencia), 16:40 y 20:05. Una demo puede enseñar un aviso en el móvil sin tocar Railway.
- **El histórico simulado.** `backfill-main.js` genera N días con el mismo guion y un reloj virtual, y los publica por MQTT como si fueran mensajes en directo (LF-77). Lo usa la carga de la ventana.
- **Por qué decide el reloj y no el azar.** En directo, la semilla no hace repetible el simulador: el orden de los temporizadores reales también consume números aleatorios. El guion fija qué pasa a cada hora, y la semilla solo varía los detalles.
- **Las previsualizaciones** siguen en `normal` y sin retención: sus pruebas no esperan paradas y duran poco.

## La ventana fija

La API borra cada hora lo que queda fuera de la ventana (`RetentionService`):

| Variable | Producción | Qué conserva |
|---|---|---|
| `HISTORY_RAW_RETENTION_DAYS` | 2 | Telemetría en bruto, una muestra por caja. Siempre conserva el último mensaje de cada célula, del que se recupera el estado al arrancar |
| `HISTORY_EVENTS_RETENTION_DAYS` | 31 | Cambios de estado y de conexión, con sus alarmas |
| `HISTORY_AGGREGATES_RETENTION_DAYS` | 31 | Agregados por hora, de los que salen el histórico y los indicadores |

Los avisos ya enviados se borran siempre al cabo de un día. La retención no borra una hora que siga pendiente de agregar.

Con la ventana llena, la base de datos `logicflows` ocupa unos **15 MB**: unos 6 MB de telemetría de dos días, y menos de 1 MB de estados y agregados de 31 días.

## Cargar o reiniciar la ventana

Con la base de datos vacía, o para reiniciar la demo:

```sh
infra/railway/cargar-ventana.sh production 31
```

**Borra el histórico:** solo tiene sentido con datos simulados. Sigue este orden porque la API descarta una sesión anterior a la última que conoce (ADR-0004), y también la conoce por los mensajes retenidos que el broker le entrega al suscribirse:

1. Detiene el simulador con `railway down`. Escalarlo a 0 réplicas no lo detiene: Railway lo vuelve a desplegar.
2. Borra sus mensajes retenidos en el broker.
3. Vacía el histórico (`infra/postgres/vaciar-historico.sql`).
4. Reinicia la API, que olvida las sesiones que conocía.
5. Genera los días con el histórico simulado.
6. Espera a que la API lo guarde y vuelve a arrancar el simulador **fijando su región**: tras `railway down`, un despliegue nuevo va a la región por defecto, `us-west2`.

Los pasos 2 y 5 corren en servicios temporales con las credenciales del simulador por referencia, que se borran al terminar. Se crean con una imagen que termina al instante (busybox) y después se cambian de una vez, con un solo despliegue: con la imagen del simulador, Railway arrancaría el simulador en directo en cuanto se crea el servicio.

Tarda unos 10 minutos. Después, la API sigue guardando el histórico durante otro cuarto de hora, a unos 300 mensajes por segundo en Railway.

**Después de cargar:**

1. Comprobar que el simulador está en Ámsterdam: `railway status --json` debe mostrar `europe-west4-drams3a` en el último despliegue del simulador.
2. Al cabo de una hora, cuando la retención haya borrado la telemetría antigua, **compactar una vez** (ver abajo).
3. Al día siguiente, medir que el tamaño no crece.

## Medir

| Qué | Cómo |
|---|---|
| Tamaño y filas de la ventana | `infra/railway/ejecutar-sql.sh production infra/postgres/medir-ventana.sql` (solo lee) |
| Memoria y CPU de cada servicio | `railway metrics -a -e production --since 6h --memory --cpu` |
| Evolución de la memoria | `railway metrics -s <servicio> -e production --since 1d --memory --raw --json` |
| Coste del mes | `railway usage` |

`ejecutar-sql.sh` entra como administrador en la base de datos por defecto (`railway`), así que cada script SQL empieza con `\connect logicflows`.

## Compactar tras la primera retención

La retención borra filas, pero PostgreSQL no devuelve ese espacio al disco: el autovacuum solo lo marca para reutilizarlo. Tras cargar la ventana, la telemetría de 31 días deja el fichero en unos 80 MB aunque solo se conserven dos días. Como la ventana no crece, ese hueco nunca se llegaría a llenar.

Se compacta **una vez**, cuando la retención ya ha borrado lo antiguo:

```sql
\connect logicflows
set lock_timeout = '10s';
vacuum (full, analyze) telemetry_samples;
vacuum (full, analyze) cell_state_changes;
vacuum (full, analyze) cell_hourly;
```

`VACUUM FULL` reescribe la tabla y la bloquea mientras tanto. Con unas 20 000 filas, el bloqueo dura unos 130 ms y la ingesta solo espera. `lock_timeout` evita que se quede esperando si alguien tiene la tabla ocupada. A partir de ahí, el autovacuum basta: lo que borra cada hora se reutiliza con lo que entra.

## Consumo

Railway cobra la memoria y la CPU por minuto: 10 USD por GB y mes, y 20 USD por vCPU y mes. El plan Hobby incluye 5 USD de uso al mes. La demo apenas usa CPU, así que **el coste lo marca la memoria**. Para estimar el mes: memoria total en GB × 10 USD. La previsión de `railway usage` con pocos días de mes no es fiable (el 3 de octubre indicaba 1,63 USD para todo el mes).

| Servicio | 4 oct 2026 | 5 oct 2026, antes de LF-96 | 5 oct 2026, con LF-96 (`sha-81982e8`) |
|---|---|---|---|
| `identity` (Keycloak) | 747 MB | 567 MB | 538 MB |
| `api` | 88 MB | 240–290 MB | **97 MB** |
| `Postgres` | 150 MB | 193–211 MB | 214 MB |
| `dashboard` | 40 MB | 41 MB | 40 MB |
| `simulator` | 36 MB | 40 MB | 40 MB |
| `broker` | 9 MB | 5 MB | 9 MB |
| **Total** | **unos 1 070 MB, ~10,7 USD al mes** | **unos 1 100 MB, ~11 USD al mes** | **unos 940 MB, ~9,4 USD al mes** |

En Railway, la API queda por debajo de lo medido en local (140 MB de memoria residente): Railway no mide exactamente lo mismo que `VmRSS`, así que se compara siempre con la misma herramienta. PostgreSQL no volvió a sus 150 MB tras la carga del 4 de octubre; si sigue así, es lo siguiente que conviene mirar.

**Lo que se ha ajustado (LF-96):**

- **Keycloak:** heap de Java fijo (`-Xmx256m`) y caché local. Por defecto, Keycloak reserva un porcentaje de la memoria que ve, y en Railway ve la de toda la máquina, 8 GB. Con una sola réplica no necesita el clúster de Infinispan.
- **API y simulador:** `NODE_OPTIONS=--max-semi-space-size=8` en la imagen. Es el mismo problema que con Keycloak: Node calcula los límites del montón con los 8 GB que ve, reserva una generación joven de decenas de megas y no la devuelve. La API usa unos 50 MB de montón y tenía reservados 160. Se limita solo la generación joven, no el montón total (`--max-old-space-size`): así puede seguir creciendo si el broker le entrega de golpe los 50 000 mensajes que guarda tras una caída (LF-90).
- **PostgreSQL no se toca:** lo gestiona la plantilla de Railway, y bajar su memoria apenas ahorraría unos céntimos.

Medido en local el 5 de octubre de 2026, con la imagen de la API y 7 días del guion (60 833 mensajes), en dos rondas:

| `NODE_OPTIONS` | Al arrancar | Tras la ingesta | Ritmo de ingesta |
|---|---|---|---|
| ninguna | 246 MB | 301 MB | 1 520–1 560 mensajes/s |
| `--max-semi-space-size=8` | 141 MB | 191 MB | 1 270–1 480 mensajes/s |
| `--max-old-space-size=192` (solo arranque) | 230 MB | — | — |

El ritmo con el ajuste sigue siendo cuatro veces el que admite Railway (unos 300 mensajes por segundo), donde el límite no está en la API.

## Registro de mediciones

| Fecha | Medida | Resultado |
|---|---|---|
| 4 oct 2026 | Ventana de 31 días en local, con toda la telemetría | 81 MB |
| 5 oct 2026, 06:46 UTC | Producción, primera retención aplicada | 21 304 muestras desde el 3 oct a las 06:20, 1 740 cambios de estado y 744 horas desde el 4 sep; el fichero sigue en 81 MB (72 MB de telemetría) |
| 5 oct 2026, 06:47 UTC | Producción, tras `VACUUM FULL` | **15 MB** (telemetría, 5,9 MB) |
| 6 oct 2026 | Producción, un día después | Pendiente: debe seguir en unos 15 MB |

## Lo que enseñó la carga en producción

- **Mensajes retenidos.** La API conoce las sesiones también por los mensajes retenidos que el broker le entrega al suscribirse. En local funcionó porque el broker estaba vacío. Hay que borrarlos antes de reiniciar la API.
- **`railway down` y la región.** Escalar a 0 réplicas no detiene un servicio; `railway down` sí. Pero el despliegue siguiente no conserva la región: el simulador estuvo del 4 al 5 de octubre en `us-west2`, y sus mensajes cruzaban el Atlántico. El plan de la infraestructura como código no lo detectó (decía «al día»). Se corrigió con `railway service scale --service simulator europe-west4-drams3a=1 us-west2=0`, y el script ya fija la región.
- **Railway arranca un servicio en cuanto se crea.** Si la imagen tiene una orden por defecto peligrosa, se crea con una imagen inocua y se cambian imagen y orden de una vez.
- **Un script de producción nunca va detrás de `| tail`** ni de `| grep -q`: con `pipefail`, el primero oculta el código de salida y el segundo puede cortar la tubería. Se guarda la salida entera y después se busca.
- **Reiniciar no arregla la memoria.** La primera idea fue reiniciar la API después de la carga, suponiendo que guardaba el pico de la ingesta. Un proceso recién arrancado ya ocupaba 240 MB. La causa se encontró midiendo desde dentro de Node (`process.memoryUsage()` y `v8.getHeapStatistics()`) con la imagen de producción en local.

**Sin explicar:** la API marcó entre 80 y 90 MB en producción desde el 1 hasta el 4 de octubre, con varias versiones, y subió a unos 270 MB en el reinicio de las 22:20 UTC del 4 de octubre, sin cambios de imagen, variables ni réplicas. En local, la misma imagen siempre arranca por encima de 240 MB. El ajuste de LF-96 corrige el comportamiento local, que es el que se puede reproducir.

**Abierto:** la API registra un aviso de `pg`: `client.query()` mientras el cliente ya ejecuta otra consulta. Dejará de funcionar en `pg@9`.
