# ADR-0009: Autenticación y autorización

- **Estado:** Aceptado. Roles ampliados por [ADR-0022](0022-reconocimiento-de-alarmas.md)
- **Fecha:** 2026-10-01
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-46

## Contexto

Hasta `v0.1.0` el sistema solo se ejecuta en local y no tiene autenticación. En el Hito 2 se despliega en Internet (LF-49), con previsualizaciones por pull request (LF-53). Hay tres puntos de entrada que proteger:

1. **El visor y la API REST** (`/api/v1`): personas que consultan el estado y la producción.
2. **El canal de tiempo real** (`/realtime`): WebSocket desde el navegador, que no permite enviar cabeceras propias al conectar.
3. **El broker MQTT**: células o pasarelas de planta que publican telemetría.

Requisitos:

- Las plantas industriales suelen tener ya un directorio corporativo (Microsoft Entra ID, Active Directory, Google Workspace). Integrarlo no debe obligar a cambiar el código.
- El visor se ejecuta en el navegador, como PWA y como aplicación Android (ADR-0002). No puede guardar un secreto de cliente.
- Ninguna contraseña de personas se guarda en la base de datos de LogicFlows.
- Las previsualizaciones y las pruebas de extremo a extremo necesitan usuarios de prueba sin depender de un servicio externo.
- Sin coste de licencias en esta fase.

## Opciones consideradas

1. **Proveedor de identidad gestionado con OpenID Connect** (Auth0, Microsoft Entra External ID, Clerk).
2. **Keycloak autoalojado**, proveedor de identidad de código abierto con OpenID Connect.
3. **Usuarios propios en la API**: tabla de usuarios en PostgreSQL, contraseñas con Argon2 y tokens JWT emitidos por la API.

## Decisión

1. **Estándar: OpenID Connect y OAuth 2.0.** La API es un *resource server*: valida tokens de acceso JWT firmados por el proveedor de identidad, con sus claves públicas (JWKS), el emisor y la audiencia configurados por variables de entorno. La API no conoce qué proveedor hay detrás.
2. **Proveedor: Keycloak** en una versión con soporte vigente, con un *realm* `logicflows` versionado en el repositorio. Se usa en local, en las pruebas, en las previsualizaciones y en producción. Con configuración, una planta puede sustituirlo por su directorio corporativo o federarlo con él.
3. **Visor: flujo Authorization Code con PKCE**, cliente público sin secreto. El token de acceso se guarda solo en memoria y caduca a los 5 minutos; se renueva con un token de refresco rotatorio. Al cerrar sesión se revocan ambos.
4. **Roles:**
   - **`viewer`**: consulta el estado, la producción y las alarmas. Es el rol de operarios y supervisores.
   - **`admin`**: además, administra la plataforma. En el Hito 2 no hay acciones de administración; el rol se reserva para no cambiar el modelo después.
5. **REST:** cabecera `Authorization: Bearer`. Sin token válido, la respuesta es 401; sin el rol necesario, 403. Ambas en formato RFC 9457. `/health` sigue sin autenticación para la plataforma, y `/docs` documenta el esquema de seguridad.
6. **Tiempo real: tiques de un solo uso.**
   - El visor pide un tique con `POST /api/v1/realtime/tickets`, autenticado como cualquier petición REST.
   - Conecta a `/realtime?ticket=…`. El tique caduca a los 30 segundos y solo sirve una vez.
   - La API cierra la conexión con el código 4401 cuando caduca el token con el que se obtuvo el tique. El visor pide un tique nuevo y reconecta, como ya hace tras cualquier corte.
7. **MQTT: credenciales por célula o pasarela.**
   - Cada célula o pasarela tiene su propio usuario en el broker.
   - La lista de control de acceso le permite publicar solo en los topics de su planta. Se usa el patrón de Mosquitto con el nombre de usuario, de modo que una célula comprometida no puede suplantar a otras plantas.
   - Fuera de local, el broker solo acepta conexiones cifradas con TLS.
   - Los usuarios del broker se gestionan sin reiniciarlo, con el plugin de seguridad dinámica de Mosquitto.

## Justificación

**OpenID Connect frente a usuarios propios.** Los usuarios propios son la opción más rápida de implementar, pero hacen a LogicFlows responsable de guardar contraseñas, recuperarlas, bloquear ataques de fuerza bruta y ofrecer doble factor. Además, cada planta tendría que dar de alta a su personal a mano en lugar de usar su directorio. OpenID Connect delega todo eso en un componente especializado y es el estándar que esperan los departamentos de TI industriales.

**Keycloak frente a un proveedor gestionado.** Un servicio gestionado evita operar el proveedor de identidad, pero añade una cuenta externa con su propio coste y límites. Además, cada previsualización y cada prueba de extremo a extremo dependerían de un servicio de Internet. Keycloak funciona igual en un contenedor local que en producción, se configura como código (*realm* versionado) y no tiene licencias. Como la API solo depende del estándar, cambiar a un servicio gestionado sería un cambio de configuración.

**Tiques frente a otras formas de autenticar el WebSocket.** Los navegadores no permiten cabeceras propias al abrir un WebSocket. Poner el token de acceso en la URL lo expondría en los registros de proxies y servidores. Autenticar con el primer mensaje obligaría a mantener conexiones sin identificar mientras llega. Un tique de un solo uso y 30 segundos de vida puede aparecer en un registro sin riesgo, y la API decide si acepta la conexión antes de enviar la instantánea (ADR-0006).

**Credenciales por célula.** Con un único usuario compartido, cualquier célula comprometida podría publicar en nombre de todas. Separar las credenciales permite revocar una sola y limita lo que puede hacer.

## Alternativas descartadas

**Proveedor gestionado (Auth0, Entra External ID, Clerk).** Será preferible si operar Keycloak resulta costoso o si un cliente exige un servicio con garantías de disponibilidad. El cambio solo afecta a la configuración del emisor y de los clientes.

**Usuarios propios en la API.** Solo tendría sentido para un despliegue aislado sin ningún proveedor de identidad disponible.

**Certificados de cliente TLS para las células.** Más robustos que usuario y contraseña, pero exigen una autoridad de certificación y su ciclo de renovación. Se valorarán con la conexión a planta real.

## Consecuencias

**Positivas:**

- Inicio de sesión único, doble factor y federación con directorios corporativos sin código propio.
- La API no guarda contraseñas de personas.
- Local, pruebas, previsualizaciones y producción usan el mismo mecanismo.

**Costes y riesgos:**

- Keycloak es un servicio más que desplegar, actualizar y vigilar. Necesita su propia base de datos, que puede ser otra base del mismo PostgreSQL, y unos 512 MB de memoria.
- Cada previsualización incluye su Keycloak con usuarios de prueba, lo que aumenta su coste y su tiempo de arranque.
- El visor depende de una librería de OpenID Connect certificada en lugar de implementar el protocolo.
- En la aplicación Android, la redirección tras iniciar sesión necesita un esquema de URL propio (Hito 3).
- Las contraseñas MQTT de las células se gestionan como secretos de cada entorno (LF-48).

## Criterios de revisión

- Un cliente exige usar su proveedor de identidad sin Keycloak como intermediario.
- Operar Keycloak consume más tiempo que el que ahorra.
- Aparecen acciones sobre la planta (comandos, configuración) que necesitan permisos más finos que dos roles.
- Las células pasan a conectarse desde redes de planta reales: se reconsideran los certificados de cliente.

## Notas de implementación

**1 de octubre de 2026, LF-50 y LF-51.** Dos detalles de la decisión se ajustan a lo que permite la implementación, sin cambiar la decisión:

- **Dónde se guardan los tokens del visor.** El flujo con redirección necesita conservar el verificador PKCE mientras el navegador visita el proveedor, y la librería guarda todo el estado de la sesión en un mismo almacén. Por eso los tokens se guardan en `sessionStorage` en lugar de solo en memoria:
  - El almacén es propio de cada pestaña y se borra al cerrarla.
  - El token de acceso dura 5 minutos y el de refresco es de un solo uso.
  - La defensa frente a XSS sigue siendo no ejecutar código ajeno: la política de seguridad de contenidos llega con el endurecimiento (LF-52).
- **Tiques de un solo uso con varias instancias.** Cada instancia recuerda los tiques que ya aceptó. Con varias instancias, un mismo tique podría usarse una vez en cada una durante sus 30 segundos de vida. Se acepta porque el tique solo abre un canal de lectura para quien ya tenía un token válido. Un registro compartido de tiques usados se valorará si aparecen acciones sobre la planta.

## Actualización (8 de octubre de 2026): rol `operator`

[ADR-0022](0022-reconocimiento-de-alarmas.md) añade el rol `operator` entre los dos anteriores, como preveía el criterio de revisión sobre acciones en la planta. Puede reconocer alarmas e incluye `viewer`; `admin` pasa a incluir `operator`. `viewer` sigue siendo de solo lectura.

## Referencias

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [RFC 7636: PKCE](https://www.rfc-editor.org/rfc/rfc7636)
- [OAuth 2.0 for Browser-Based Applications (IETF)](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/)
- [Keycloak](https://www.keycloak.org/documentation)
- [Mosquitto: listas de control de acceso y seguridad dinámica](https://mosquitto.org/documentation/dynamic-security/)
