# Diseño del visor

Sistema visual del visor, revisado en el Hito 5 (rediseño visual). El visor se consulta en planta, a distancia y con prisa: su objetivo es que una persona sepa **de un vistazo** si cada célula produce y, si no, qué ocurre y qué tan grave es. También se enseña en demos, así que tiene que parecer un producto de planta creíble.

Los valores (colores, tipografía, espaciado y radios) están en el paquete [`@logicflows/design-tokens`](../packages/design-tokens) ([ADR-0020](adr/0020-tokens-de-diseno.md)). Este documento explica cómo se usan. Las pantallas resultantes, con capturas en claro, oscuro y móvil, están en [Pantallas del visor](diseno/pantallas.md), la exploración que llevó a esta dirección, en [Exploración con Stitch](diseno/exploracion-stitch.md), y la presentación para el dosier, en el [Dosier de diseño](diseno/dosier.md).

## Principios

Basados en la norma ISA-101 de interfaces de operación de alto rendimiento, revisados en el Hito 5 (LF-110):

1. **El color señala lo anómalo.** Superficies neutras y texto oscuro sobre claro, o claro sobre oscuro. El color intenso se reserva para lo que requiere atención: rojo para fallos y paradas de emergencia y ámbar para esperas. Lo normal («Produciendo») va en un verde discreto sobre un fondo suave, que no compite con una alarma.
2. **Nunca solo color.** Cada estado y cada alarma combinan icono, texto y color. Así se distinguen con daltonismo, con reflejos en la pantalla o en blanco y negro (WCAG 1.4.1). El esquema de la célula repite en texto lo que dibuja.
3. **Jerarquía por importancia.** Primero el estado de la célula y sus alarmas; después la producción; al final el detalle de robot, cinta y palé.
4. **Legible a distancia.** Cifras grandes en JetBrains Mono, de ancho fijo para que no «bailen» al cambiar, y con separador de miles. Texto de 14 px como mínimo y etiquetas de 12 px solo en lo secundario.
5. **Un único elemento expresivo.** El esquema cinta → robot → palé, solo en el detalle de una célula. El atractivo del resto sale de la tipografía, el espaciado y las superficies, no de colorear lo normal.
6. **Mismo diseño en todas las plataformas.** Modo `md` de Ionic (ADR-0002); el contenido se reorganiza según el ancho, no cambia. El inicio de sesión de Keycloak usa los mismos tokens (LF-108).

## Temas

Claro y oscuro, con los mismos nombres de token y valores distintos. El visor sigue al sistema hasta que el usuario elige «Claro» u «Oscuro» en el menú, y recuerda la elección (LF-105). El oscuro está pensado para pantallas de planta y salas con poca luz, no como adorno: mantiene las mismas reglas de color.

## Estados de la célula (ADR-0003)

| Estado | Texto | Icono | Tono (`--lf-state-…`) | Cuándo llama la atención |
|---|---|---|---|---|
| `RUNNING` | Produciendo | ▶ *play* | `ok`: verde discreto | Nunca: es lo normal |
| `STARTING` | Arrancando | ⟳ *sync* | `info`: azul | No |
| `STOPPED` | Detenida | ■ *stop* | `neutral` | No |
| `PAUSED` | En pausa | ⏸ *pause* | `neutral` | No |
| `WAITING` | En espera · sin cajas / salida ocupada | ⧗ *hourglass* | `warning`: ámbar | Sí: pérdida de producción ajena a la célula |
| `FAULT` | Fallo | ⚠ *warning* | `danger`: rojo | Sí: requiere intervención |
| `EMERGENCY_STOP` | Parada de emergencia | ✋ *hand* | `danger`, borde más grueso | Sí, la máxima: además, aviso global en la parte superior |

El estado se muestra con `app-state-badge`: icono y texto en el color del tono sobre su fondo suave. Los estados que llaman la atención colorean además el borde izquierdo de la tarjeta. Encima del panel, un resumen cuenta las células de cada estado, de lo más grave a lo normal (LF-106).

## Alarmas

| Severidad | Texto | Icono | Tono (`--lf-alarm-…`) |
|---|---|---|---|
| `CRITICAL` | Crítica | ✋ | `danger` |
| `HIGH` | Alta | ⚠ | `danger` |
| `MEDIUM` | Media | ⚠ | `warning` |
| `LOW` | Baja | ⓘ | `info` |

Las alarmas activas aparecen **justo debajo del estado**, de más a menos grave, con `app-alarm-item`: severidad escrita en su color, código en monoespaciada, desde cuándo, y el mensaje en el color del texto. Van sobre el fondo suave de su severidad y con un borde izquierdo de su color. Sin alarmas, la sección no ocupa espacio.

**Reconocer** ([ADR-0022](adr/0022-reconocimiento-de-alarmas.md)):

- Con el rol `operator` o `admin`, cada alarma sin reconocer lleva el botón **Reconocer**, en la tarjeta y en el detalle. Tocar el aviso de una alarma en el móvil abre el detalle de su célula.
- Una alarma reconocida **sigue en pantalla**, porque sigue activa. Pierde el fondo de color, conserva el borde y la severidad, y dice quién la atiende («Reconocida por operaria a las 08:32»). Así, lo que nadie atiende destaca sobre lo que ya se atiende (ISA-101).
- Si no se puede reconocer, el motivo aparece debajo del botón («La alarma ya no está activa»).
- En el registro del histórico, cada reconocimiento es una entrada («ROB-001 reconocida por operaria»).

## Indicadores de producción

| Indicador | Formato | Ejemplo |
|---|---|---|
| Cajas | Entero con separador de miles, grande | **15.234** cajas |
| Palés | Entero | 312 |
| Capa | «*n* de *m*», con barra de avance del palé | 3 de 5 |
| Ritmo | Entero, cajas por hora | 820 cajas/h |
| Tiempo de ciclo | Segundos con un decimal | 4,2 s |
| Robot y cinta | Texto: en movimiento / parado / averiado | Robot: en movimiento |

Cada indicador es un `app-indicator`: nombre en el texto secundario, cifra en monoespaciada y unidad aparte, siempre escrita. Cuando falta un dato se muestra «—», nunca un cero que pueda confundirse con un valor real.

## Comparar células

`/comparison` (LF-130), en el menú como «Comparar»: los indicadores de cada célula de la planta en el mismo periodo (hoy, 7 o 30 días).

- **Tabla ordenable:** cada cabecera es un botón que ordena por esa columna, con `aria-sort` y una flecha. Por defecto, de menor a mayor disponibilidad: lo que requiere atención, arriba. Las células sin dato van siempre al final.
- **La peor, sin depender del color:** la de menor disponibilidad lleva la etiqueta «Menor disponibilidad» con su icono y un borde ámbar, y un aviso encima de la tabla lo dice en texto. Si empatan, no se señala ninguna.
- **En el móvil**, una lista con los indicadores de cada célula en lugar de una tabla ancha.
- Cada célula enlaza con su histórico, y la comparación se descarga en CSV con el formato del histórico.

## Detalle de una célula

Estado, alarmas, el **esquema de la célula** y la producción (LF-106). El esquema dibuja la cinta, el robot y el palé capa a capa: las capas terminadas en el color primario, la que está en curso con su avance y las que faltan discontinuas. Las piezas en marcha van en verde discreto, las paradas en neutro y solo una avería en rojo. El dibujo es decorativo; debajo, el mismo contenido en texto.

## Histórico

La página de histórico de una célula sigue los mismos principios (LF-81, LF-107):

- **Periodo** con tres botones (Hoy, 7 días, 30 días). El elegido se marca relleno y con `aria-pressed`.
- **Cada bloque en su panel:** indicadores, gráfico, paradas por causa y registro.
- **Gráfico de barras** en el color primario, sin colores de alarma: la producción no es una anomalía. Tiene un resumen para lectores de pantalla y una tabla equivalente desplegable.
- **Registro de estados y alarmas:** una entrada por cambio, con la hora en monoespaciada y el icono sobre el fondo suave de su tono. Las alarmas van en una línea («Alta · ROB-001 · mensaje»): es un registro compacto.
- **Paradas** con el texto primero y una barra en el tono de aviso, proporcional a la parada más larga.

## Tipografía

| Uso | Fuente | Tamaño (token) | Peso |
|---|---|---|---|
| Contador de cajas | JetBrains Mono | 3,5 rem (56 px) | 600 |
| Estado en la tarjeta | Inter | `--lf-font-size-lg` (20 px) | 600 |
| Otros indicadores | JetBrains Mono | `--lf-font-size-lg` (20 px) | 600 |
| Títulos de página | Inter | `--lf-font-size-xl` (28 px) | 600 |
| Texto general | Inter | `--lf-font-size-md` (16 px) | 400 |
| Texto secundario | Inter | `--lf-font-size-sm` (14 px) | 400 |

Las fuentes van incluidas en la aplicación (ADR-0020): funcionan sin conexión y no salen a un tercero. El texto se puede ampliar hasta el 200 % sin perder contenido (WCAG 1.4.4).

## Contraste y comprobaciones

- **Tokens:** una prueba del paquete calcula el contraste de cada par de texto y fondo en los dos temas. Exige 4,5:1 para texto, incluido el texto de una alarma sobre el fondo de su severidad, y 3:1 para bordes y foco.
- **Pantallas:** axe-core comprueba WCAG 2.2 AA en el navegador, en claro y en oscuro, en escritorio, tableta y móvil, para el panel, el detalle y el histórico (LF-37).
- **Capturas de referencia:** la CI compara el panel, el detalle y el histórico, en los dos temas y en escritorio y móvil, con sus capturas (`apps/dashboard/e2e/capturas/`). Un cambio visual no buscado hace fallar la pull request (LF-110). Cómo se actualizan está en el [README del visor](../apps/dashboard/README.md#capturas-de-referencia).

## Estados de la conexión

El indicador de la cabecera muestra «En directo» con un punto que late (quieto si el sistema pide reducir el movimiento), «Conectando…» o «Sin conexión», siempre con texto. Sin conexión, las tarjetas conservan el último dato conocido y la célula desconectada lo indica.
