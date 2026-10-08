# Demo del Hito 6

Guion para enseñar la operación de planta de LogicFlows `v0.6.0` en producción, en unos 12 minutos: el visor ya no solo enseña la planta, sirve para dirigir un turno. Complementa la [demo del Hito 5](demo-hito-5.md), que recorre el diseño.

## Preparación

- Producción con `v0.6.0` y el rol `operator` creado en el realm ([pasos](../infra/keycloak/README.md#crear-el-rol-operator-en-producción-adr-0022-lf-126)).
- Dos cuentas del realm `logicflows`: una con `operator`, para reconocer alarmas, y otra con `admin`, para el calendario. Las direcciones están en [Despliegue](despliegue.md).
- **Hora:** en horario de turno (lunes a viernes, de 06:00 a 22:00 en Madrid), poco después de una alarma grave del guion diario ([ADR-0019](adr/0019-datos-de-la-demo.md)): las de `cell-01` son a las 9:47, 11:15 (parada de emergencia), 16:40 y 20:05, y las demás células las repiten desfasadas entre 23 y 67 minutos.
- **App Android:** el APK de `v0.6.0` instalado y los avisos activados, con la cuenta `operator`.

## Recorrido

| Paso | Qué hacer | Qué se ve | Qué demuestra |
|---|---|---|---|
| 1 | Abrir el panel | Cuatro células, cada una con su ritmo y sus incidencias | Varias máquinas simuladas desde un solo servicio, sin coste añadido (LF-123) |
| 2 | En una alarma activa, pulsar **Reconocer** con la cuenta `operator` | La alarma sigue en pantalla, sin fondo de color, con «Reconocida por … a las …» | Reconocer es «la he visto y me ocupo»: no resuelve la alarma ni toca la máquina (ADR-0022) |
| 3 | Abrir el mismo panel en otro navegador o en la app | El reconocimiento aparece sin recargar | Tiempo real para todos los que miran la planta |
| 4 | En la app, tocar el aviso de una alarma grave | Se abre el detalle de su célula, con el botón **Reconocer** | Del aviso a la acción en un toque (LF-128) |
| 5 | Ir a **Turnos** | Mañana y tarde de lunes a viernes; los fines de semana, sin turnos | El tiempo planificado sale del calendario, no de suponer (ADR-0021) |
| 6 | Con la cuenta `admin`, marcar un día futuro sin turnos | El día aparece en la lista; una fecha de hoy o anterior se rechaza | El pasado no se reescribe: los indicadores ya enseñados no cambian |
| 7 | Ir a **Comparar**, 7 días | Las cuatro células de menor a mayor disponibilidad; la peor, señalada con texto | Dónde actuar primero, sin depender del color (LF-130) |
| 8 | Ordenar por **Rendimiento** y abrir el histórico de la peor | Su histórico, con «Detenida en turno» si se paró dentro de un turno | Una célula parada en mitad del turno ya resta disponibilidad (LF-125) |
| 9 | Descargar la comparación en CSV | Una fila por célula, con el tiempo de turno | Los datos salen a una hoja de cálculo sin pasos intermedios |

## Después de la demo

- Quitar el día sin turnos que se marcó en el paso 6, si sigue siendo futuro.
- Los reconocimientos no se deshacen: quedan en el registro, como en una planta real.
