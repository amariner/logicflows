# Demo del Hito 3

Guion para enseñar la app Android de LogicFlows `v0.3.0` en unos 15 minutos: instalarla desde la release, iniciar sesión, ver la célula en directo y recibir un aviso de alarma con la app cerrada. Complementa la [demo del Hito 2](demo-hito-2.md), que recorre el sistema desplegado.

## Preparación

- Un móvil con Android 7 o posterior, con conexión, y el APK `logicflows-v0.3.0.apk` de la [release](https://github.com/amariner/logicflows/releases/tag/v0.3.0) descargado en él.
- Una cuenta con rol `viewer` en el realm `logicflows` de producción ([alta de usuarios](../infra/keycloak/README.md#alta-y-primer-acceso-en-producción-lf-48)).
- Acceso al proyecto de Railway, para provocar alarmas desde el simulador de producción (pasos 6 y 9).
- La pantalla del móvil compartida, o el móvil a la vista.

Producción usa el escenario `normal`, que no genera alarmas. Durante la demo se cambia a `averias`, con una alarma grave cada pocos minutos, y al terminar se vuelve a `normal`.

## Recorrido

| Paso | Qué hacer | Qué se ve | Qué demuestra |
|---|---|---|---|
| 1 | En la release, enseñar el APK, su SHA-256 y la huella del certificado | `logicflows-v0.3.0.apk` adjunto por el flujo **App Android** | Cada versión publica su APK firmado, comprobable antes de instalarlo (ADR-0014) |
| 2 | Abrir el APK en el móvil y permitir la instalación | La app **LogicFlows** con el icono de la PWA | Distribución sin tienda, adecuada para una demo |
| 3 | Abrir la app y pulsar **Iniciar sesión** | El inicio de sesión de Keycloak en el navegador del sistema, no dentro de la app | La contraseña no pasa por la app (RFC 8252) |
| 4 | Iniciar sesión con la cuenta `viewer` | La app vuelve sola a la célula `cell-01`, **En directo**, con el contador avanzando | El mismo visor que en el navegador, generado desde el mismo código (ADR-0002) |
| 5 | Aceptar el permiso de notificaciones | Android lo pide justo después de iniciar sesión, no al instalar | Los avisos solo se activan con sesión y se pueden desactivar desde el menú (ADR-0015) |
| 6 | En Railway, poner `SIMULATOR_SCENARIO=averias` en el servicio `simulator` de producción y bloquear el móvil | En pocos minutos llega «Alarma … en LogicFlows» con `demo / cell-01` | El aviso llega con la app cerrada y no incluye datos de la planta |
| 7 | Tocar el aviso | La app se abre en la célula, con la alarma activa | Del aviso al detalle en un toque, tras la sesión |
| 8 | Abrir **Histórico** y bajar al registro | La alarma recién avisada, con su hora y su duración | Lo que avisa el móvil queda registrado (LF-84) |
| 9 | Borrar `SIMULATOR_SCENARIO` del servicio `simulator` | El simulador vuelve a `normal` y dejan de llegar avisos | Avisar es una decisión de la API: no hace falta tocar la célula |
| 10 | Quitar el wifi con la app abierta | «Conectando…» y, con datos móviles, otra vez **En directo** | La app no enseña datos antiguos como actuales (LF-70) |
| 11 | Enviar la app al segundo plano un par de minutos y volver | Reconecta enseguida y el contador está al día | Android congela la vista web; la app lo detecta y recarga el estado |

## Después de la demo

- Comprobar que `SIMULATOR_SCENARIO` ya no existe en el servicio `simulator` de producción.
- Si se usó un móvil prestado, cerrar sesión: el dispositivo se da de baja de los avisos.
