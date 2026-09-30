# ADR-0006: Canal de tiempo real entre la API y el visor

- **Estado:** Aceptado
- **Fecha:** 2026-10-01
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-27

## Contexto

El visor muestra el estado y la producción de las células en tiempo real: una caja paletizada debe aparecer en pantalla en menos de un segundo (LF-28). La API ya recibe y valida la telemetría (LF-26) y la publica en un flujo interno. Falta decidir cómo llega del servidor al visor, que se ejecuta en el navegador, como PWA y como aplicación Android.

Requisitos:

- Envío del servidor al cliente sin que el visor consulte periódicamente.
- Estado completo al conectar, sin esperar al siguiente cambio de cada célula.
- Varios clientes simultáneos.
- Funcionamiento en navegadores, en el WebView de Android y a través de proxies y balanceadores.
- En el Hito 1 el visor solo recibe datos; las acciones del usuario (como reconocer una alarma) se enviarán más adelante.

## Opciones consideradas

1. **WebSocket nativo** con `@nestjs/platform-ws`.
2. **Socket.IO** con `@nestjs/platform-socket.io`.
3. **Server-Sent Events (SSE).**
4. **MQTT sobre WebSocket**: el visor se suscribe directamente al broker.

## Decisión

1. La API expone un **WebSocket nativo** en la ruta **`/realtime`**.
2. Mensajes del servidor en JSON, definidos como tipos en `@logicflows/contract`:
   - **`snapshot`**, al conectar: la última información conocida de todas las células (conexión, estado y telemetría).
   - **`cell`**, en cada cambio: la información actualizada de una célula.
3. La API mantiene en memoria la última información de cada célula a partir del flujo interno de la ingesta. Tras reiniciarse, la reconstruye con los mensajes retenidos del broker.
4. El servidor envía un *ping* cada 30 segundos y cierra las conexiones que no responden, para liberar las conexiones muertas.
5. El cliente es responsable de reconectar con espera creciente. Al reconectar recibe un `snapshot` nuevo, así que no necesita recuperar los cambios perdidos.

## Justificación

**WebSocket nativo frente a Socket.IO.** Socket.IO añade salas, reconexión automática y alternativas para navegadores sin WebSocket, pero usa un protocolo propio que obliga a usar su librería en el cliente y en cualquier herramienta de prueba. Todos los navegadores y el WebView de Android admiten WebSocket, las salas no hacen falta para difundir a todos los clientes y la reconexión es poco código en el visor. Un protocolo estándar mantiene el visor libre de dependencias y facilita integrar otros clientes.

**WebSocket frente a SSE.** SSE es más simple para enviar datos del servidor al cliente y el navegador reconecta solo. Se descarta porque el visor necesitará enviar acciones en tiempo real más adelante, porque en HTTP/1.1 el navegador limita a seis las conexiones por dominio y porque `EventSource` no permite enviar cabeceras de autenticación, que harán falta en el Hito 2.

**Frente a MQTT desde el visor.** Es habitual en IIoT y reutilizaría el broker, pero expondría el broker a Internet, obligaría a gestionar usuarios del visor en su lista de control de acceso y saltaría la validación y las reglas de secuencia de la API. Además, el visor recibiría mensajes de telemetría en bruto en lugar de la vista de cada célula. La arquitectura mantiene la API como única puerta de entrada de los datos.

**Instantánea más cambios.** Enviar el estado completo al conectar y después solo los cambios evita que un cliente que se conecta o reconecta muestre datos incompletos, sin necesidad de números de secuencia ni recuperación de mensajes perdidos entre el servidor y el visor.

## Alternativas descartadas

**Socket.IO.** Sería la opción preferente si hubiera que segmentar clientes en muchos grupos (salas por planta o por usuario) o dar soporte a entornos donde WebSocket esté bloqueado.

**SSE.** Una opción válida si el visor nunca necesitara enviar datos en tiempo real.

**MQTT sobre WebSocket.** Podría reconsiderarse para clientes internos de planta que no pasen por Internet.

## Consecuencias

**Positivas:**

- El visor usa la API estándar `WebSocket` del navegador, sin librerías.
- Un cliente siempre tiene la información completa tras conectar o reconectar.
- Los tipos de los mensajes se comparten entre la API y el visor.

**Costes y riesgos:**

- La reconexión y la espera creciente se implementan en el visor (LF-28 y LF-36).
- La información en memoria no se comparte entre instancias de la API. Con varias instancias, cada una debe recibir todos los mensajes del broker (sin suscripción compartida) para tener la misma información, o hará falta un almacén compartido. Se decidirá con la infraestructura del Hito 2.
- OpenAPI no describe el canal WebSocket: sus mensajes se documentan en el README de la API y en los tipos del contrato.
- Sin autenticación hasta el Hito 2.

## Criterios de revisión

- El visor necesita suscribirse solo a algunas células o plantas y el volumen de mensajes lo justifica.
- El número de clientes simultáneos o de instancias de la API obliga a distribuir los mensajes entre instancias.
- Aparecen clientes en redes que bloquean WebSocket.

## Referencias

- [RFC 6455: el protocolo WebSocket](https://www.rfc-editor.org/rfc/rfc6455)
- [WebSockets en NestJS](https://docs.nestjs.com/websockets/gateways)
- [Server-Sent Events, especificación HTML](https://html.spec.whatwg.org/multipage/server-sent-events.html)
