# Demo del Hito 4

Guion para enseñar el histórico de LogicFlows `v0.4.0` en unos 15 minutos: qué ha producido una célula, cuánto tiempo produjo de verdad, por qué se paró y qué pasó en cada momento. Complementa la [demo del Hito 2](demo-hito-2.md), que recorre el sistema desplegado.

## Preparación

Producción solo tiene histórico desde que se desplegó la versión, así que la demo usa el entorno local con 30 días de histórico simulado (LF-77):

```sh
pnpm infra:reset
docker compose --profile apps up -d --wait api dashboard
SIMULATOR_BACKFILL_DAYS=30 SIMULATOR_SCENARIO=turno pnpm simulator:historico
docker compose --profile apps up -d --wait simulator
```

- **Primero el histórico:** la API descarta las sesiones anteriores a la que ya conoce (ADR-0004), así que se carga antes de arrancar el simulador en directo.
- **Tiempo:** 30 días son unos 270 000 mensajes, publicados en algo más de un minuto. La API tarda unos 4 minutos en guardarlos, y el agregado por hora va a la par (comprobado el 3 de octubre de 2026).
- **Visor:** `http://localhost:8100`, con el usuario `operario` del realm local.

## Recorrido

| Paso | Qué hacer | Qué se ve | Qué demuestra |
|---|---|---|---|
| 1 | Abrir el visor y, en la tarjeta de `cell-01`, pulsar **Histórico** | La producción de hoy por horas, con su disponibilidad, su rendimiento y sus paradas | Los indicadores de planta de [indicadores de planta](indicadores-de-planta.md), calculados de los agregados por hora (ADR-0016) |
| 2 | Elegir **7 días** y después **30 días** | Una barra por día local. Los días sin datos se ven sin barra y cuentan como tiempo sin datos | Las consultas leen agregados: responden en milisegundos aunque haya un mes de datos |
| 3 | Leer la nota de los indicadores | Tiempo en producción frente al planificado, tiempo sin datos y ritmo nominal | `STOPPED` no cuenta como parada y la desconexión no cuenta como fallo: los indicadores no engañan |
| 4 | Revisar **Paradas por causa** | Sin cajas, pausa del operario, salida ocupada y fallos por código de alarma, de la más larga a la más corta | Dónde se pierde producción, en el vocabulario de la planta |
| 5 | Bajar al **Registro de estados y alarmas** | Cada cambio con su hora, su duración y sus alarmas, y las desconexiones | Revisar una incidencia concreta: qué pasó, cuándo y cuánto duró (LF-84) |
| 6 | Abrir **Ver los datos en una tabla** y navegar con el teclado | La tabla equivalente al gráfico | El gráfico es accesible: tiene resumen para lectores de pantalla y tabla (WCAG 2.2 AA) |
| 7 | Cambiar el sistema a tema oscuro, o abrir el visor en el móvil | La misma vista con los colores del tema y en una columna | Un único visor para escritorio, móvil y Android (ADR-0002) |
| 8 | Abrir `http://localhost:3000/docs` y probar `GET …/history` y `GET …/events` | Las respuestas de la API, documentadas en OpenAPI | El histórico también está disponible para otros sistemas |
| 9 | Explicar las copias de seguridad | El volcado diario, la restauración de prueba que avisa si falla y su trabajo en la CI | El histórico no se puede reconstruir desde las células, así que se protege (ADR-0017) |

## Después de la demo

Para volver al entorno local habitual, sin histórico: `pnpm infra:reset` y `pnpm stack:up`.
