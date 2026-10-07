# Demo del Hito 5

Guion para enseñar el rediseño visual de LogicFlows `v0.5.0` en producción, en unos 10 minutos: un visor que se entiende de un vistazo, en claro y oscuro, en el móvil y en el escritorio, y lo que hay detrás de su diseño. Complementa la [demo del Hito 4](demo-hito-4.md), que recorre el histórico.

## Preparación

- Producción con `v0.5.0` desplegada y el tema de Keycloak activado en el realm ([pasos](../infra/keycloak/README.md)).
- Una cuenta con rol `viewer` en el realm `logicflows` de producción. Las direcciones están en [Despliegue](despliegue.md).
- **Hora:** el guion diario de la demo ([ADR-0019](adr/0019-datos-de-la-demo.md)) tiene alarmas graves a las 9:47, 11:15 (parada de emergencia), 16:40 y 20:05, hora de Madrid. Poco después de una de ellas, el panel enseña los estados de atención.
- **App Android:** el APK de `v0.5.0` instalado en el móvil, desde la [release](https://github.com/amariner/logicflows/releases).

## Recorrido

| Paso | Qué hacer | Qué se ve | Qué demuestra |
|---|---|---|---|
| 1 | Abrir el visor en una ventana privada | El inicio de sesión con la marca y la tipografía de LogicFlows | El primer contacto ya es el producto: el tema de Keycloak usa los mismos tokens que el visor (LF-108) |
| 2 | Iniciar sesión y mirar el panel | El resumen de estados y las tarjetas: neutras si todo va bien, con borde de color solo las que requieren atención | ISA-101: el color intenso solo señala lo anómalo, y cada estado combina icono, texto y color |
| 3 | Abrir el menú y elegir **Oscuro**, después **Claro** | El mismo panel en los dos temas, sin recargar | Un único sistema de diseño en claro y oscuro (ADR-0020, LF-105) |
| 4 | En una tarjeta, pulsar **Detalle** | El estado, las alarmas, el esquema cinta → robot → palé con la capa en curso y la producción, en tiempo real | El único elemento expresivo del visor, con su contenido también en texto (LF-106) |
| 5 | Desde el detalle, ir al **Histórico** | Indicadores, gráfico, paradas y registro en paneles | El histórico del Hito 4 con el diseño nuevo (LF-107) |
| 6 | Abrir la app Android | El icono y la pantalla de arranque con la marca, y el mismo visor | Un solo código para web, PWA y Android (ADR-0002, LF-109) |
| 7 | Enseñar `docs/diseno/proceso.md` | De la exploración con Stitch al código: qué se filtró, dónde viven los valores y cómo se comprueba | El diseño es un proceso repetible y verificable: contraste en los tokens, axe y capturas de referencia en la CI |

## Después de la demo

En producción no hay nada que deshacer. La elección de tema se guarda en el dispositivo: **Sistema** vuelve a seguir al sistema.
