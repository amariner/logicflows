# Indicadores de planta

Qué significa cada indicador del histórico de una célula de paletizado (LF-78) y cómo se calcula a partir de sus estados (ADR-0003) y su producción (ADR-0004). Siguen las definiciones habituales de la eficiencia global de los equipos (OEE), adaptadas a lo que la célula informa. Los ejemplos numéricos son los casos de prueba del cálculo en la API (LF-80).

## Tiempos de un periodo

Cada segundo del periodo pertenece a uno de los estados de la célula según su último mensaje `state`, o a «sin datos» si la célula estaba desconectada (`status` con `online: false`).

| Tiempo | Qué incluye | Para qué cuenta |
|---|---|---|
| **Total** | Todo el periodo pedido | — |
| **Sin datos** | La célula estaba desconectada | Se excluye: no se sabe qué hizo |
| **Fuera de producción** | `STOPPED`: parada ordenada, sin fallos | Se excluye: no se pretendía producir |
| **Planificado** | Total − sin datos − fuera de producción | Base de la disponibilidad |
| **En producción** | `RUNNING` | Lo que suma a la disponibilidad |
| **Paradas** | `STARTING`, `PAUSED`, `WAITING`, `FAULT` y `EMERGENCY_STOP` | Lo que resta, por causa |

**Por qué `STOPPED` no cuenta como parada.** Sin un calendario de turnos, la parada ordenada es la mejor señal de que no se pretendía producir: fin de turno, cambio de referencia, mantenimiento previsto. Cuando haya calendario, el tiempo planificado saldrá de él, y `STOPPED` dentro de un turno pasará a ser una parada.

**Por qué el arranque es una parada.** Mientras la célula está en `STARTING` no produce, y un arranque que se repite mucho es una pérdida que conviene ver.

## Indicadores

### Disponibilidad

> Disponibilidad = tiempo en producción ÷ tiempo planificado

Fracción del tiempo en que se pretendía producir y la célula produjo de verdad. Si el tiempo planificado es 0, no está definida y se muestra «—».

### Rendimiento

> Rendimiento = cajas producidas ÷ (tiempo en producción × ritmo nominal)

Fracción de las cajas que la célula habría producido trabajando siempre a su ritmo nominal mientras estaba en producción. El cambio de pallet ocurre en `RUNNING` y lo rebaja, como debe ser. Si el tiempo en producción es 0, no está definido.

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

Toda la noche en `STOPPED`: el tiempo planificado es 0, y la disponibilidad y el rendimiento no están definidos («—»). Una disponibilidad del 0 % daría a entender que la célula falló toda la noche.

## Cómo encaja con el histórico

Los agregados por hora de ADR-0016 guardan, por célula y hora, los segundos en cada estado (y en «sin datos»), las cajas y los pallets, y las paradas por causa (LF-79). Los indicadores de cualquier periodo se calculan sumando esas horas (LF-80).
