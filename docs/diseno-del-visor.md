# Diseño del visor

Sistema visual y bocetos del visor para el Hito 1. El visor se consulta en planta, a distancia y con prisa: su objetivo es que una persona sepa **de un vistazo** si cada célula produce y, si no, qué ocurre y qué tan grave es.

## Principios

Basados en la norma ISA-101 de interfaces de operación de alto rendimiento:

1. **El color señala lo anómalo.** La interfaz es sobria y neutra. El color intenso se reserva para lo que requiere atención: fallos, paradas de emergencia y esperas. Una pantalla llena de colores hace que lo importante no destaque.
2. **Nunca solo color.** Cada estado y cada alarma combinan icono, texto y color. Así se distinguen con daltonismo, con reflejos en la pantalla o en blanco y negro (WCAG 1.4.1).
3. **Jerarquía por importancia.** Primero el estado de la célula y sus alarmas; después la producción; al final el detalle de robot y cinta.
4. **Legible a distancia.** Las cifras clave son grandes, de ancho fijo (no «bailan» al cambiar) y con separador de miles.
5. **Mismo diseño en todas las plataformas.** Modo `md` de Ionic (ADR-0002); el contenido se reorganiza según el ancho, no cambia.

## Estados de la célula (ADR-0003)

| Estado | Texto | Icono | Color | Cuándo llama la atención |
|---|---|---|---|---|
| `RUNNING` | Produciendo | ▶ *play* | Verde, discreto | Nunca: es lo normal |
| `STARTING` | Arrancando | ⟳ *sync* | Azul | No |
| `STOPPED` | Detenida | ■ *stop* | Gris | No |
| `PAUSED` | En pausa | ⏸ *pause* | Gris azulado | No |
| `WAITING` | En espera · sin cajas / salida ocupada | ⧗ *hourglass* | Ámbar | Sí: pérdida de producción ajena a la célula |
| `FAULT` | Fallo | ⚠ *warning* | Rojo | Sí: requiere intervención |
| `EMERGENCY_STOP` | Parada de emergencia | ✋ *hand* | Rojo, borde grueso | Sí, la máxima: además, aviso global en la parte superior |

El estado se muestra como una **etiqueta grande con icono y texto** en la cabecera de cada tarjeta. Los estados que llaman la atención colorean además el borde izquierdo de la tarjeta.

## Alarmas

| Severidad | Texto | Icono | Color |
|---|---|---|---|
| `CRITICAL` | Crítica | ✋ | Rojo |
| `HIGH` | Alta | ⚠ | Rojo |
| `MEDIUM` | Media | ⚠ | Ámbar |
| `LOW` | Baja | ⓘ | Azul |

Las alarmas activas aparecen **justo debajo del estado**, ordenadas de más a menos grave, con su severidad escrita, su código, su mensaje y cuánto tiempo llevan activas. Sin alarmas, la sección no ocupa espacio.

## Indicadores de producción

| Indicador | Formato | Ejemplo |
|---|---|---|
| Cajas | Entero con separador de miles, grande | **15.234** cajas |
| Pallets | Entero | 312 pallets |
| Capa | «capa *n* de *m*», con barra de progreso del pallet | capa 3 de 5 |
| Ritmo | Entero, cajas por hora | 820 cajas/h |
| Tiempo de ciclo | Segundos con un decimal | 4,2 s |
| Robot y cinta | Texto: en movimiento / parado / averiado | Robot: en movimiento |

Unidades siempre escritas. Cuando falta un dato se muestra «—», nunca un cero que pueda confundirse con un valor real.

## Histórico

La página de histórico de una célula (LF-81) sigue los mismos principios:

- **Periodo** con tres botones (Hoy, 7 días, 30 días). El elegido se marca relleno y con `aria-pressed`.
- **Indicadores** en la misma rejilla y con el mismo tamaño que los de producción. Si no están definidos, «—» (docs/indicadores-de-planta.md).
- **Gráfico de barras** en el tono informativo, sin colores de alarma: la producción no es una anomalía. Muestra el máximo arriba y el primer y último periodo debajo. Tiene un resumen para lectores de pantalla y una tabla equivalente desplegable.
- **Paradas** con el texto primero y una barra en el tono de aviso, proporcional a la parada más larga.

## Tipografía

| Uso | Tamaño | Peso |
|---|---|---|
| Contador de cajas | 3,5 rem (56 px) | 700 |
| Estado | 1,25 rem (20 px) | 700 |
| Otros indicadores | 1,5 rem (24 px) | 600 |
| Texto general | 1 rem (16 px) como mínimo | 400 |

Cifras con `font-variant-numeric: tabular-nums`. El texto se puede ampliar hasta el 200 % sin perder contenido (WCAG 1.4.4).

Los valores de producción y el texto de las alarmas usan el color principal del texto, no el gris secundario de las tarjetas. Ionic solo define `--ion-text-color` en la paleta oscura, así que se usa siempre con su valor por defecto: `var(--ion-text-color, #000)`. Una prueba en el navegador lo comprueba en ambos temas (LF-43).

## Contraste

Todo texto cumple una relación de contraste de 4,5:1 como mínimo, y los iconos y bordes que transmiten información 3:1 (WCAG 1.4.3 y 1.4.11), en tema claro y oscuro. Se comprueba automáticamente en la CI (LF-37).

## Bocetos

### Escritorio (≥ 992 px)

Menú lateral fijo y rejilla de tarjetas que aprovecha el ancho.

```text
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ LogicFlows   │ Células                                    (☁ En directo)   │
│              ├──────────────────────────────────────────────────────────────┤
│ ▦ Células    │ ┌────────────────────────────┐ ┌────────────────────────────┐│
│              │ ┃ cell-01          Planta demo│ │ cell-02          Planta demo││
│              │ ┃ ⚠ FALLO                     │ │ ▶ Produciendo               ││
│              │ ┃ ┌─────────────────────────┐ │ │                             ││
│              │ ┃ │⚠ Alta · ROB-001 · 2 min │ │ │   15.234 cajas              ││
│              │ ┃ │ Colisión del robot      │ │ │   312 pallets · capa 3 de 5 ││
│              │ ┃ └─────────────────────────┘ │ │   ▓▓▓▓▓▓░░░░                ││
│              │ ┃   8.120 cajas               │ │   820 cajas/h · ciclo 4,2 s ││
│              │ ┃   162 pallets · capa 1 de 5 │ │   Robot: en movimiento      ││
│              │ ┃   ▓░░░░░░░░░                │ │   Cinta: en marcha          ││
│              │ ┃   0 cajas/h · ciclo —       │ └────────────────────────────┘│
│              │ ┃   Robot: averiado           │                               │
│              │ └────────────────────────────┘                               │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

### Móvil (< 576 px)

Una columna; el menú se despliega con el botón de la barra. Con una parada de emergencia activa, un aviso fijo ocupa la parte superior en cualquier tamaño.

```text
┌─────────────────────────────┐
│ ☰ Células     (☁ En directo)│
├─────────────────────────────┤
│ ✋ PARADA DE EMERGENCIA EN   │
│    cell-03                  │
├─────────────────────────────┤
│┃ cell-03       Planta demo  │
│┃ ✋ Parada de emergencia     │
│┃ ✋ Crítica · SAF-001 · 1 min│
│┃   Parada de emergencia     │
│┃   activada                 │
│┃   4.310 cajas              │
│┃   86 pallets · capa 2 de 5 │
│┃   ▓▓▓░░░░░░░               │
│┃   0 cajas/h · ciclo —      │
│┃   Robot: parado            │
└─────────────────────────────┘
```

### Tableta (576-991 px)

Menú desplegable como en móvil y dos columnas de tarjetas.

## Estados de la conexión

El indicador de la barra superior (LF-28) muestra *En directo*, *Conectando…* o *Sin conexión*, con icono y texto. Sin conexión, las tarjetas conservan el último dato conocido y la célula desconectada lo indica en su tarjeta.
