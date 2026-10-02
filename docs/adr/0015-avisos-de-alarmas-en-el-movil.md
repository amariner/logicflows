# ADR-0015: Avisos de alarmas en el móvil

- **Estado:** Aceptado
- **Fecha:** 2026-10-02
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-66

## Contexto

El visor muestra las alarmas de cada célula en tiempo real (ADR-0003), pero solo a quien lo está mirando. En planta, el personal no tiene el visor delante: una parada de emergencia o un fallo del robot se descubre tarde. El Hito 3 pide que la app Android avise de una alarma aunque no esté abierta.

Partimos de esta situación:

- **Las alarmas viajan en los mensajes `state`** (ADR-0004), con `code`, `severity` (`LOW`, `MEDIUM`, `HIGH` o `CRITICAL`), `message` y `raisedAt`. La API ya ve cada cambio de estado de cada célula.
- **Android congela una app en segundo plano.** Su vista web deja de ejecutarse y el WebSocket del tiempo real se corta (LF-70). Nada que dependa de la app abierta puede avisar con la app cerrada.
- **Un mensaje push a un Android pasa siempre por Firebase Cloud Messaging (FCM),** de Google. Es el único canal que el sistema mantiene vivo con la app cerrada, también para los navegadores (Web Push en Chrome usa FCM por debajo).
- **El visor se puede instalar como PWA** (LF-55), además de como app (ADR-0014).

## Opciones consideradas

1. **Notificaciones push con FCM, enviadas por la API.** La app registra su token de FCM en la API. Cuando la API detecta una alarma grave, la envía a FCM y FCM la entrega aunque la app esté cerrada.
2. **Notificaciones locales desde la app.** La app avisa cuando recibe la alarma por el WebSocket. Para hacerlo en segundo plano, necesitaría un servicio en primer plano de Android con la conexión siempre abierta.
3. **Web Push en la PWA, sin app nativa.** La API envía con claves VAPID propias al servicio de push del navegador. El contenido va cifrado de extremo a extremo y no hace falta ninguna cuenta.

## Decisión

1. **La app Android recibe notificaciones push de FCM** con `@capacitor/push-notifications`, y la API las envía con la API HTTP v1 de FCM.
2. **Avisan las alarmas `CRITICAL` y `HIGH`** al activarse, y la entrada en `EMERGENCY_STOP`. Una activación es la terna célula, `code` y `raisedAt`. Se avisa una vez por activación, nunca mientras siga activa ni al resolverse.
3. **El aviso lleva lo mínimo para actuar:**
   - **Título:** la gravedad («Alarma crítica en LogicFlows»).
   - **Cuerpo:** la planta y la célula (`demo / cell-01`).
   - **Datos de la célula:** para que, al tocar el aviso, se abra su vista.
   - **Nunca el texto de la alarma ni datos de producción:** el detalle se ve en la app, tras iniciar sesión.

   Así, lo único que sale de la planta hacia Google es que una célula tiene una alarma grave y cuándo.
4. **Cada dispositivo registra su token de FCM** en la API (`POST /api/v1/push/devices`, rol `viewer`), asociado al usuario. Se borra al cerrar sesión y cuando FCM responde que ya no es válido (`UNREGISTERED`).
5. **Los avisos caducan a la hora** (`ttl`). Un aviso por célula sustituye al anterior (`collapse_key`), así que un móvil que vuelve a tener cobertura no recibe una ristra de alarmas antiguas.
6. **La persona controla los avisos.** La app pide permiso de notificaciones (Android 13 o superior) solo tras iniciar sesión, explicando para qué, y se pueden desactivar desde la propia app.
7. **La credencial de FCM es una cuenta de servicio del proyecto de Firebase**, sellada en Railway como `FCM_SERVICE_ACCOUNT`. Sin la variable, la API no envía avisos, como `/metrics` sin `METRICS_TOKEN` (ADR-0013). El proyecto de Firebase lo crea el Tech Lead, en el plan gratuito Spark, que no pide tarjeta.

## Justificación

- **Es la única opción que cumple el objetivo.** Avisar con la app cerrada exige un canal que Android mantenga vivo, y en Android ese canal es FCM.
- **La exposición de datos es pequeña y explícita.** FCM ve que hay una alarma grave en una célula, no qué alarma ni la producción. El contrato de la planta no sale de nuestro sistema.
- **Sin coste.** FCM es gratuito y el plan Spark de Firebase no pide tarjeta.
- **Reutiliza lo que ya existe.** La API ya recibe cada cambio de estado y el contrato ya trae la gravedad. El aviso es una consecuencia más de la ingesta, como la persistencia o el tiempo real.

## Alternativas descartadas

- **Notificaciones locales (opción 2).** No dependen de terceros, pero con la app cerrada no funcionan. Un servicio en primer plano mantendría la conexión a costa de batería, de una notificación permanente y de código nativo propio. Para una demo, el coste no compensa.
- **Web Push en la PWA (opción 3).** No necesita cuentas y el contenido va cifrado de extremo a extremo: es la opción más respetuosa con los datos. La vista web de la app Android no admite la API Push, así que no serviría para la app, que es el objetivo del hito. Se reconsiderará si la PWA pasa a ser la forma principal de uso en móvil, porque reutilizaría la detección de alarmas y el registro de dispositivos de esta decisión.
- **Enviar el texto completo de la alarma.** Sería más cómodo leerlo sin abrir la app, pero mandaría a un tercero información de la planta que hoy no necesita salir.

## Consecuencias

- **Hay un proveedor más, Google.** Si FCM falla, se pierden los avisos durante la caída, no el sistema: el visor sigue mostrando las alarmas.
- **Un secreto más,** `FCM_SERVICE_ACCOUNT`, que se rota como los demás (`docs/despliegue.md`).
- **La API guarda los tokens de los dispositivos.** Es una tabla nueva, con su migración aditiva (ADR-0007), ligada al usuario de Keycloak.
- **La app necesita `google-services.json` del proyecto de Firebase.** No contiene secretos, pero ata la compilación a ese proyecto. Sin el fichero, la app se compila sin avisos.
- **Con el proyecto de Firebase creado,** Firebase App Distribution queda a mano. Es uno de los criterios de revisión de ADR-0014.
- **Avisar es una decisión de la API, no de la célula.** Cambiar qué gravedades avisan no exige tocar el simulador ni el contrato.

## Criterios de revisión

- Una planta real exige que ningún dato salga a terceros: entonces, Web Push para la PWA o un servicio en primer plano con la conexión propia.
- Hace falta avisar por otros canales (correo, SMS o el sistema de la planta), o escalar si nadie atiende el aviso.
- Varias plantas o equipos: avisar solo a quien corresponde a cada planta, con roles por planta.
- Se necesita iOS: APNs, a través del mismo FCM.
