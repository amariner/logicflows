# Exploración visual con Stitch (Hito 5)

Primer paso del rediseño del visor ([LF-100](https://logicflows.atlassian.net/browse/LF-100)): generar propuestas con Google Stitch antes de invertir en Figma y en código. Las pantallas generadas están en el fichero de Figma **LogicFlows · Diseño del visor**, página *01 · Exploración (Stitch)*, sin editar.

El proceso completo (Stitch → Figma → código) se describe en [proceso.md](proceso.md) al cerrar el hito.

## Prompts

Se usó un prompt base con el contexto del producto y la regla de ISA-101, y después prompts cortos para cada variante y pantalla.

**Base (panel de células, escritorio):**

```text
Diseña el panel principal de LogicFlows, una plataforma industrial (IIoT) que monitoriza en tiempo real células robotizadas de paletizado: un robot coloca cajas en palés por capas, alimentado por una cinta. La usan jefes de planta y operarios, a menudo de un vistazo y a distancia, y se enseña en demos a compradores industriales.

Estilo: profesional, moderno y sobrio, con aspecto de producto SaaS industrial de calidad (referencias: Linear, Vercel, Grafana, Siemens Insights Hub). Interfaz en español.

Regla clave (norma ISA-101 de interfaces de operación): la interfaz es neutra y el color intenso se reserva para lo anómalo. Verde discreto para "Produciendo"; ámbar para esperas; rojo solo para fallos y paradas de emergencia. Cada estado combina icono, texto y color, nunca solo color. Contraste WCAG AA.

Contenido de la pantalla:
- Cabecera con el logotipo "LogicFlows", la planta "Planta demo", un indicador "En directo" con punto pulsante y el usuario.
- Una rejilla de tarjetas, una por célula ("Célula 01" a "Célula 04"). Cada tarjeta muestra:
  - Estado grande con icono: Produciendo, En espera · sin cajas, Fallo, En pausa.
  - Si hay alarmas: severidad escrita (Alta, Media), código (ROB-002) y mensaje ("Pinza del robot sin vacío"), con el tiempo que llevan activas.
  - Cajas de hoy en cifra grande con separador de miles (15.234), palés (312), capa actual "capa 3 de 5" con barra de progreso del palé, ritmo "820 cajas/h" y tiempo de ciclo "4,2 s".
  - Disponibilidad de hoy (92 %) y un botón "Histórico".
- Una de las células en "Fallo" con una alarma alta, otra "En espera", el resto produciendo.

Cifras con tipografía de ancho fijo, tipografía sans moderna y legible, esquinas suavemente redondeadas y mucho aire. Tema claro.
```

**Variantes:** tema oscuro para pantallas de planta; una dirección más expresiva, con color de acento propio y un esquema de la célula (cinta → robot → palé) en cada tarjeta; adaptación a móvil; parada de emergencia con aviso global. **Otras pantallas:** histórico de una célula e inicio de sesión.

## Resultado

| Panel · claro | Panel · oscuro | Panel · expresiva | Inicio de sesión · claro |
|---|---|---|---|
| ![Panel en tema claro](capturas/stitch-panel-claro-movil.png) | ![Panel en tema oscuro](capturas/stitch-panel-oscuro-movil.png) | ![Panel en la dirección expresiva](capturas/stitch-panel-expresiva-movil.png) | ![Inicio de sesión](capturas/stitch-inicio-de-sesion-claro.png) |

Hay una quinta pantalla en Figma, probablemente el inicio de sesión en tema oscuro, que no se llegó a leer desde el entorno de desarrollo: el plan gratuito de Figma limita las lecturas automáticas.

### Lo que se extrajo

**Dirección sobria (claro y oscuro).** Paleta tonal de Material 3, compatible con Ionic:

| Papel | Claro | Oscuro |
|---|---|---|
| Texto principal | `#0b1c30` | `#f1f5f9` |
| Texto secundario | `#45474c` | `#94a3b8` |
| Texto terciario | `#75777d` | `#64748b` |
| Primario (información, acciones) | `#006398` | `#38bdf8` |
| Superficies | `#f8f9ff`, `#eff4ff`, `#e5eeff`, `#dce9ff` | `#0e1726`, `#131f33`, `#16253d`, `#1e2e47` |
| Fallo | `#ba1a1a` sobre `#ffdad6` | `#f87171` sobre `#84232c` |
| Espera | — | `#f59e0b` |
| Produciendo | `#059669` | `#34d399` |

- **Tipografía:** JetBrains Mono para casi todo (cifras, etiquetas y textos) e Inter solo en títulos. La variante oscura mezcla además Space Grotesk e IBM Plex Sans.
- **Tamaños:** sobre todo 10 y 11 px en etiquetas; cifras de 28 px.
- **Radios:** 2, 4, 8 y 12 px.

**Dirección expresiva.** Acento violeta (`#4f46e5`, `#c3c0ff`), Space Grotesk en títulos y un esquema de la célula en cada tarjeta, con la cinta, el robot y el palé y su capa.

## Revisión del Tech Lead

Stitch acierta en el tono: la dirección sobria respeta ISA-101 (neutra, rojo solo para el fallo, ámbar para la espera) y tiene aspecto de producto. Pero una IA generativa **rellena huecos con lo que parece verosímil**, y eso hay que filtrarlo antes de pasar a Figma y a código:

1. **Afirmaciones falsas.** «Conforme ISA-101 / IEC 62443 Arquitectura SIL-3», «TLS 1.3 256-Bit», «Servidor local OPC-UA: Conectado», «© 2025 LogicFlows Industrial Robotics Inc.». LogicFlows no tiene ninguna certificación ni conexión OPC-UA. Ante un comprador industrial, una certificación inventada es un riesgo legal y de credibilidad. **Se eliminan todas.**
2. **Funciones que no existen.** Tarjeta RFID/NFC, SSO corporativo, «¿Olvidó su contraseña?», «Recordar esta estación», «Ver diagnóstico», «Reconocer» alarmas y la navegación inferior (Patrón, Líneas, Alarmas, Lotes). El inicio de sesión lo sirve Keycloak (ADR-0009), así que su pantalla será un tema de Keycloak con sus campos reales (LF-108). Reconocer alarmas es parte de la operación de planta, el hito siguiente.
3. **Datos que no están en el contrato.** Meta del turno, línea de producto, modelo del robot, formato del palé, OEE con decimales. Lo que no está en el contrato (ADR-0004) o en los indicadores de planta no se muestra. Si se quiere, se añade antes al contrato con su tarea.
4. **Inglés y formatos.** Textos en inglés («Gateway online», «Kinematics») y decimales con punto (94.2). La interfaz es en español, con coma decimal y separador de miles.
5. **Legibilidad.** Etiquetas de 10 px en mayúsculas y monoespaciadas: lucen, pero se leen mal a distancia y en un móvil en planta. Mínimo 12 px para texto, y la monoespaciada solo para cifras y códigos (de ancho fijo, como pide el diseño del visor).

Ninguno de estos puntos invalida la exploración: es el trabajo esperado al pasar de una propuesta generada a un diseño de producto.

## Elección

Decidido por el Tech Lead el 7 de octubre de 2026:

- **Base: la dirección sobria**, en claro y en oscuro, con su paleta tonal. Es neutra y respeta ISA-101: el color intenso solo para fallos y esperas.
- **De la expresiva, solo el esquema de la célula** (cinta → robot → palé con su capa), en el detalle de una célula y no en cada tarjeta del panel. Es lo que más luce en una demo, y en un único sitio no compite con los estados.
- **Tipografía:** Inter para textos y títulos, y JetBrains Mono solo para cifras y códigos de alarma, por su ancho fijo.
- Se descarta todo lo señalado en la revisión: afirmaciones de cumplimiento, funciones y datos que no existen y textos en inglés.

**Motivo:** una demo para compradores industriales tiene que parecer un producto de planta creíble antes que un concepto llamativo. El esquema de la célula aporta lo visual donde tiene sentido.
