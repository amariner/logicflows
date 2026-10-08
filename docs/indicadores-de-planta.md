# Indicadores de planta

Qué significa cada indicador del histórico de una célula de paletizado (LF-78) y cómo se calcula a partir de sus estados (ADR-0003) y su producción (ADR-0004). Siguen las definiciones habituales de la eficiencia global de los equipos (OEE), adaptadas a lo que la célula informa. Los ejemplos numéricos son los casos de prueba del cálculo en la API (LF-80).

## Tiempos de un periodo

Cada segundo del periodo pertenece a uno de los estados de la célula según su último mensaje `state`, o a «sin datos» si la célula estaba desconectada (`status` con `online: false`).

| Tiempo | Qué incluye | Para qué cuenta |
|---|---|---|
| **Total** | Todo el periodo pedido | — |
| **Sin datos** | La célula estaba desconectada | Se excluye: no se sabe qué hizo |
| **Fuera de producción** | `STOPPED` fuera de turno: parada ordenada, sin fallos | Se excluye: no se pretendía producir |
| **Planificado** | Total − sin datos − fuera de producción | Base de la disponibilidad |
| **En producción** | `RUNNING` | Lo que suma a la disponibilidad |
| **Paradas** | `STARTING`, `PAUSED`, `WAITING`, `FAULT` y `EMERGENCY_STOP`, y `STOPPED` en turno | Lo que resta, por causa |

**`STOPPED` depende del calendario de turnos** ([ADR-0021](adr/0021-calendario-de-turnos.md)):

- **Fuera de turno**, o si la planta no tiene calendario, la parada ordenada es la mejor señal de que no se pretendía producir: fin de turno, cambio de referencia, mantenimiento previsto. Se excluye.
- **En hora de turno**, se pretendía producir: es una parada, con la causa «Detenida en turno».

El resto de situaciones cuenta igual dentro y fuera de turno. Si la célula produce fuera de turno, son horas extra: cuentan en producción y como planificadas.

**Por qué el arranque es una parada.** Mientras la célula está en `STARTING` no produce, y un arranque que se repite mucho es una pérdida que conviene ver.

## Indicadores

### Disponibilidad

> Disponibilidad = tiempo en producción ÷ tiempo planificado

Fracción del tiempo en que se pretendía producir y la célula produjo de verdad. Si el tiempo planificado es 0, no está definida y se muestra «—».

### Rendimiento

> Rendimiento = cajas producidas ÷ (tiempo en producción × ritmo nominal)

Fracción de las cajas que la célula habría producido trabajando siempre a su ritmo nominal mientras estaba en producción. El cambio de palé ocurre en `RUNNING` y lo rebaja, como debe ser. Si el tiempo en producción es 0, no está definido.

**Ritmo nominal.** Las cajas por hora que la célula está diseñada para paletizar. La célula no lo informa, así que se configura por célula en la API. Para la célula simulada es 900 cajas por hora: una cada 4 s (`SIMULATOR_BOX_INTERVAL_MS`).

### Paradas por causa

Para cada causa, el tiempo total y el número de veces que empezó en el periodo:

| Causa | Estado |
|---|---|
| Arranque | `STARTING` |
| Pausa del operario | `PAUSED` |
| Sin cajas a la entrada | `WAITING` con `STARVED` |
| Salida ocupada | `WAITING` con `BLOCKED` |
| Fallo, por código de alarma | `FAULT` |
| Parada de emergencia | `EMERGENCY_STOP` |
| Detenida en turno | `STOPPED` en hora de turno (ADR-0021) |

Un fallo cuenta para la alarma de mayor gravedad activa al entrar en `FAULT`; si hay varias con la misma gravedad, para la primera que se activó.

### Lo que no se calcula

- **Calidad.** La célula no informa de cajas rechazadas o dañadas, así que no hay tercer factor del OEE.
- **OEE.** Sin calidad, disponibilidad × rendimiento no es el OEE y no se presenta como tal.

## Ejemplos

### 1. Un turno de 8 horas

| Estado | Tiempo |
|---|---|
| `STOPPED` | 1 h (3 600 s) |
| `STARTING` | 2 min (120 s) |
| `RUNNING` | 6 h 20 min (22 800 s) |
| `FAULT` con `ROB-001` | 25 min (1 500 s), en 2 ocasiones |
| `WAITING` con `STARVED` | 10 min (600 s), en 3 ocasiones |
| `PAUSED` | 3 min (180 s), en 1 ocasión |
| **Total** | 8 h (28 800 s) |

Con 5 130 cajas producidas y un ritmo nominal de 900 cajas por hora:

- Tiempo planificado: 28 800 − 3 600 = **25 200 s**.
- Disponibilidad: 22 800 ÷ 25 200 = **90,5 %**.
- Rendimiento: 5 130 ÷ (22 800 s ÷ 3 600 × 900) = 5 130 ÷ 5 700 = **90,0 %**.
- Paradas: fallo `ROB-001` 1 500 s (2), sin cajas 600 s (3), pausa 180 s (1), arranque 120 s (1).

### 2. La célula se desconecta

El mismo turno, pero la célula estuvo desconectada 30 min (1 800 s) durante los que antes estaba en `RUNNING`: `RUNNING` pasa a 21 000 s y la producción a 4 725 cajas.

- Tiempo planificado: 28 800 − 1 800 − 3 600 = **23 400 s**.
- Disponibilidad: 21 000 ÷ 23 400 = **89,7 %**.
- Rendimiento: 4 725 ÷ (21 000 ÷ 3 600 × 900) = 4 725 ÷ 5 250 = **90,0 %**.
- **Sin datos:** 1 800 s, que se muestra aparte para que no parezca una parada.

### 3. Un periodo sin producir

Toda la noche en `STOPPED`, fuera de turno: el tiempo planificado es 0, y la disponibilidad y el rendimiento no están definidos («—»). Una disponibilidad del 0 % daría a entender que la célula falló toda la noche.

### 4. Detenida en mitad de un turno

El turno de mañana va de 06:00 a 14:00. La célula está en `RUNNING` salvo de 10:00 a 12:00, cuando el operario la deja en `STOPPED` sin motivo registrado.

| Situación | Sin calendario | Con el turno de 06:00 a 14:00 |
|---|---|---|
| `RUNNING` | 21 600 s | 21 600 s |
| `STOPPED` de 10:00 a 12:00 | 7 200 s fuera de producción | 7 200 s de parada «Detenida en turno» (1) |
| Planificado | 21 600 s | 28 800 s |
| Disponibilidad | **100 %** | **75,0 %** |

Sin calendario, dos horas paradas en mitad del turno no se notan. Con él, restan lo que deben.

### 5. Horas extra

El mismo turno de 06:00 a 14:00, y la célula sigue produciendo hasta las 15:00. Se consulta de 06:00 a 16:00:

- 14:00–15:00, `RUNNING` fuera de turno: horas extra, 3 600 s en producción y planificados.
- 15:00–16:00, `STOPPED` fuera de turno: fuera de producción, se excluye.
- Planificado: 28 800 + 3 600 = **32 400 s**; en producción, 32 400 s. Disponibilidad: **100 %**.

## Cómo encaja con el histórico

Los agregados por hora de ADR-0016 guardan, por célula y hora, los segundos en cada estado (y en «sin datos»), las cajas y los palés, y las paradas por causa (LF-79). Los indicadores de cualquier periodo se calculan sumando esas horas (LF-80), y la API los ofrece en `GET /api/v1/sites/{siteId}/cells/{cellId}/history`, en total y por horas o por días.

- **Horas sin agregado.** Cuentan como tiempo sin datos.
- **La hora en curso.** Solo cuenta lo ya agregado, que va unos segundos por detrás; lo que todavía no ha ocurrido no forma parte del tiempo total.
- **Días.** Se cuentan en la zona horaria que se pide, así que los del cambio de hora tienen 23 o 25 horas.
- **Turnos.** El calendario de la planta se aplica al consultar, hora a hora y en la hora local de la planta (ADR-0021). Los turnos empiezan y terminan en horas en punto, la resolución del histórico. Una versión del calendario entra en vigor como pronto al día siguiente, así que los indicadores de un periodo cerrado no cambian.
