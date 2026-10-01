# ADR-0010: Imágenes del broker y del proveedor de identidad

- **Estado:** Aceptado
- **Fecha:** 2026-10-01
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-61

## Contexto

Además de las tres aplicaciones, LogicFlows ejecuta dos servicios de terceros que se configuran con ficheros:

- **Mosquitto** (ADR-0004): `mosquitto.conf`, la lista de control de acceso y el script que genera las contraseñas a partir de variables de entorno.
- **Keycloak** (ADR-0009): el realm `logicflows`, con sus roles, el cliente del visor y las políticas de sesión.

En local, Docker Compose monta esos ficheros desde `infra/`. Railway (ADR-0008) no monta ficheros: cada servicio arranca solo con su imagen y sus variables de entorno.

Además, Keycloak no puede ir a producción como en local:

- en local arranca en modo desarrollo (`start-dev`), con base de datos interna;
- su realm incluye usuarios de prueba con contraseñas conocidas;
- solo admite las direcciones `localhost` del visor.

## Opciones consideradas

1. **Imágenes propias con la configuración incluida**, construidas en el mismo Dockerfile que las aplicaciones.
2. **Imágenes oficiales que escriben su configuración al arrancar** a partir de variables de entorno, con un comando de inicio personalizado en la plataforma.
3. **Servicios gestionados:** un broker MQTT en la nube (HiveMQ Cloud, EMQX Serverless) y un proveedor de identidad como servicio.

## Decisión

1. Dos etapas nuevas en el `Dockerfile`, publicadas en GitHub Container Registry y promocionadas con cada versión igual que las aplicaciones:
   - **`broker`** (`logicflows-broker`): Mosquitto con `mosquitto.conf`, la ACL y `init.sh` de `infra/mosquitto`. Las contraseñas solo llegan por variables de entorno.
   - **`identity`** (`logicflows-identity`): Keycloak compilado para producción (`kc.sh build`) con PostgreSQL y comprobaciones de salud. Arranca con `start --optimized --import-realm`.
2. **Un solo realm como fuente de verdad.** El realm de producción se genera al construir la imagen a partir de `infra/keycloak/realm-logicflows.json`:
   - se eliminan los usuarios;
   - las direcciones del visor se sustituyen por `${LOGICFLOWS_VISOR_URL}`, que Keycloak resuelve al importar;
   - la construcción falla si el resultado contiene usuarios o credenciales.
3. **Keycloak detrás del proxy de la plataforma:** atiende HTTP (`KC_HTTP_ENABLED`) y confía en las cabeceras `X-Forwarded-*` (`KC_PROXY_HEADERS`). La dirección pública se indica con `KC_HOSTNAME`.
4. **El entorno local usa la imagen `broker`.** Compose la construye en `pnpm infra:up`, de modo que el desarrollo y la CI ejecutan la misma imagen que producción. Keycloak sigue en local en modo desarrollo con los usuarios de prueba.
5. **La CI arranca la imagen `identity` contra PostgreSQL en cada pull request** (`infra/keycloak/comprobar-produccion.sh`). Comprueba el emisor de los tokens, que el realm no tiene usuarios y las direcciones admitidas del visor.

## Justificación

**Lo que llega a producción es lo que se probó.** Con imágenes propias, la configuración del broker y del realm se revisa en las pull requests, se versiona con el código y se promociona con la misma etiqueta que la API que depende de ella. Una versión `vX.Y.Z` describe el sistema completo, no solo las aplicaciones.

**Configuración en la imagen y secretos fuera.** Es la misma regla que las aplicaciones (LF-38): la imagen no contiene nada propio de un entorno. Lo que cambia entre entornos, como contraseñas, direcciones o el administrador inicial, entra por variables de entorno.

**Sin usuarios de prueba por construcción.** El realm de producción se deriva del local en lugar de mantenerse a mano, así que no se desincronizan. La comprobación en la construcción impide publicar una imagen con usuarios aunque alguien los añada por error.

## Alternativas descartadas

**Configuración generada al arrancar.** Evita publicar dos imágenes más, pero la configuración quedaría en scripts dentro de la plataforma, sin revisión de código ni versión. Además, el realm no cabe con comodidad en variables de entorno.

**Servicios gestionados.** Eliminan la operación del broker y del proveedor de identidad. A cambio añaden dos proveedores, dos cuentas y sus costes. Las capas gratuitas limitan conexiones o usuarios. Y el broker se alejaría de Mosquitto (ADR-0004), que es el mismo en local, en la CI y en producción. Se reconsiderarán si operar estos servicios llega a consumir tiempo del equipo.

## Consecuencias

**Positivas:**

- Cinco imágenes con el mismo ciclo: construir en la CI, publicar desde `main` y promocionar con cada versión.
- El realm de producción no puede contener usuarios de prueba.
- Los errores de configuración de Keycloak en modo producción, como la dirección pública, la base de datos o el proxy, se detectan en la pull request.

**Costes y riesgos:**

- **El realm solo se importa la primera vez.** Keycloak omite la importación si el realm ya existe, así que los cambios posteriores del realm no llegan a una instalación existente. Habrá que aplicarlos con la API de administración o una herramienta de migración cuando aparezca el primero.
- **La imagen de Keycloak ocupa unos 750 MB** y su construcción añade alrededor de un minuto a la CI.
- **Las previsualizaciones** necesitan usuarios de prueba que la imagen de producción no tiene. Se resolverá con el entorno de previsualización (LF-53).

## Criterios de revisión

- Operar Mosquitto o Keycloak consume más tiempo que el que ahorra tenerlos bajo control.
- Aparece el primer cambio del realm que deba llegar a producción: hay que decidir cómo migrarlo.
- Un cliente exige un proveedor de identidad propio, como el directorio de la empresa, en lugar de usuarios en Keycloak.

## Referencias

- [Keycloak: contenedores y compilación optimizada](https://www.keycloak.org/server/containers)
- [Keycloak: importar realms y variables de entorno](https://www.keycloak.org/server/importExport)
- [Keycloak: configuración detrás de un proxy inverso](https://www.keycloak.org/server/reverseproxy)
- [Mosquitto: configuración](https://mosquitto.org/man/mosquitto-conf-5.html)
