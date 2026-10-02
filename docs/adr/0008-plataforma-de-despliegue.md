# ADR-0008: Plataforma de despliegue

- **Estado:** Aceptado; las previsualizaciones, sustituidas por [ADR-0012](0012-previsualizaciones-por-pull-request.md)
- **Fecha:** 2026-10-01
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-44

## Contexto

El Hito 2 lleva el sistema fuera del ordenador local con dos entornos (ver [Entornos](https://logicflows.atlassian.net/wiki/spaces/logicflow/pages/66058)):

- **Previsualización por pull request:** un sistema completo y efímero para revisar cada cambio funcionando (LF-53).
- **Producción:** el sistema publicado, desplegado desde imágenes ya construidas y probadas (LF-49).

Cada entorno ejecuta seis servicios:

| Servicio | Tráfico | Memoria aproximada |
|---|---|---|
| Visor (Nginx) | HTTPS | 32 MB |
| API | HTTPS y WebSocket | 256 MB |
| Keycloak (ADR-0009) | HTTPS | 512–768 MB |
| PostgreSQL | Privado | 256–512 MB |
| Broker MQTT | MQTT con TLS desde las células | 32 MB |
| Simulador (célula de demostración) | Privado | 128 MB |

Requisitos:

- Previsualizaciones creadas y destruidas automáticamente con cada pull request.
- Producción desplegada desde las imágenes de una versión, sin recompilar.
- HTTPS y WebSocket; el broker accesible desde Internet con TLS.
- Secretos por entorno fuera del repositorio.
- Coste mensual acotado y predecible para un proyecto sin ingresos: el orden de decenas de euros, no de cientos.
- Un equipo de cuatro perfiles sin dedicación exclusiva a operar infraestructura.

## Opciones consideradas

1. **PaaS de contenedores con entornos por pull request integrados** (Railway).
2. **PaaS de contenedores sin previsualizaciones integradas** (Fly.io), con previsualizaciones creadas desde GitHub Actions.
3. **Kubernetes gestionado** (DigitalOcean Kubernetes, GKE Autopilot).
4. **Máquina virtual con Docker Compose** (por ejemplo, Hetzner) y un proxy inverso con certificados automáticos.

## Decisión

1. **Railway** para producción y previsualizaciones.
2. **Un proyecto con dos tipos de entorno:**
   - `production`: despliega las imágenes publicadas en GitHub Container Registry (LF-45) con la etiqueta de la versión.
   - Previsualizaciones: Railway crea un entorno automático por cada pull request, con todos los servicios y datos propios, y lo elimina al cerrarla.
3. **Promoción de imágenes en producción:**
   - La CI despliega en producción al publicar una etiqueta `vX.Y.Z`, cambiando la imagen de cada servicio a esa versión.
   - Las previsualizaciones se construyen desde el Dockerfile de la rama, porque todavía no hay imagen publicada.
4. **MQTT sobre WebSocket con TLS para las células** (`wss://`, listener WebSocket de Mosquitto). Railway termina TLS en sus dominios HTTPS, no en su proxy TCP. El listener MQTT por TCP queda solo en la red privada.
5. **PostgreSQL de Railway con copias de seguridad del volumen.** Keycloak usa su propia base de datos en el mismo servidor.
6. **Límite de gasto** configurado en la cuenta. Las previsualizaciones se detienen al cerrar la pull request; no hay entornos de larga duración aparte de producción.
7. **La cuenta la crea y la paga el Tech Lead.** Contratar un servicio no se delega. Hasta entonces, las tareas que dependen de ella (LF-48, LF-49, LF-53, LF-54) solo pueden prepararse.

## Justificación

**Previsualizaciones integradas.** Son el principal motivo del Hito 2: atacan el cuello de botella de la revisión. Railway las ofrece sin código propio: crea un entorno por pull request con todos los servicios, incluida la base de datos, y lo borra al fusionar o cerrar. Con Fly.io, Kubernetes o una máquina virtual habría que construir y mantener esa automatización.

**Coste para la carga real.**
- Railway factura por segundo de CPU y memoria usadas. Producción, con unos 1,5 GB de memoria y poca CPU, queda en el orden de 20–30 USD al mes. Una previsualización cuesta céntimos por hora mientras la pull request está abierta.
- Kubernetes gestionado parte de varios nodos y un balanceador, unos 40–80 USD al mes, antes de las previsualizaciones.
- Fly.io es barato en cómputo, pero su PostgreSQL gestionado empieza en unos 38 USD al mes por entorno.

**Operación.** Una máquina virtual sería lo más barato (unos 5–10 EUR al mes), pero el equipo asumiría parches del sistema, copias de seguridad, certificados, monitorización del propio servidor y la automatización de las previsualizaciones. Es el trabajo que el Hito 2 quiere evitar para centrarse en el producto.

**Imágenes estándar.** Railway ejecuta las mismas imágenes Docker de LF-38 con variables de entorno, así que cambiar de plataforma no exige cambiar las aplicaciones.

## Alternativas descartadas

**Kubernetes gestionado.** Es el estándar cuando hay muchos servicios, varios equipos o requisitos de autoescalado y alta disponibilidad, y es una competencia valiosa. Para seis servicios y un entorno de producción, su complejidad (manifiestos o Helm, ingress, certificados, almacenamiento, actualizaciones del clúster) no se justifica todavía. Se reconsiderará con varios clientes o requisitos de disponibilidad.

**Fly.io.** Buena opción con TCP y TLS propios para MQTT y presencia en varias regiones. Se descarta por la automatización de previsualizaciones que habría que mantener y por el coste de PostgreSQL gestionado por entorno.

**Máquina virtual con Docker Compose.** Preferible si el presupuesto fuera el factor decisivo o si un cliente exigiera un despliegue en sus propias instalaciones. Las imágenes y el `compose.yaml` actuales ya lo permiten.

## Consecuencias

**Positivas:**

- Previsualización por pull request sin automatización propia.
- HTTPS, dominios y certificados gestionados por la plataforma.
- Coste proporcional al uso, con límite de gasto.

**Costes y riesgos:**

- **Dependencia de un proveedor.** Se mitiga con imágenes estándar, configuración por variables de entorno y migraciones SQL propias. La configuración de Railway se documenta en el repositorio.
- **Sin alta disponibilidad de PostgreSQL ni del broker.** Aceptable mientras no haya plantas reales; es un criterio de revisión.
- **MQTT sobre WebSocket** en lugar del puerto estándar 8883. Las pasarelas industriales habituales lo admiten, pero algunas solo hablan MQTT por TCP.
- **Las previsualizaciones se construyen desde el código**, no desde una imagen publicada. Producción sí usa siempre imágenes promocionadas.
- Planes, precios y límites se comprobarán al crear la cuenta. Si las previsualizaciones con base de datos no estuvieran en el plan elegido, se revisará esta decisión antes de LF-53.

## Criterios de revisión

- El coste mensual supera los 60 USD de forma sostenida.
- Una planta real exige alta disponibilidad, MQTT por TCP en el puerto 8883 o un despliegue en sus instalaciones.
- El número de servicios o equipos hace que Kubernetes compense su complejidad.
- La plataforma cambia de condiciones de forma que rompa los requisitos anteriores.

## Referencias

- [Railway: entornos y entornos por pull request](https://docs.railway.com/guides/environments)
- [Railway: proxy TCP](https://docs.railway.com/reference/tcp-proxy)
- [Railway: precios](https://railway.com/pricing)
- [Fly.io: PostgreSQL gestionado](https://fly.io/docs/mpg/)
- [Mosquitto: listeners WebSocket](https://mosquitto.org/man/mosquitto-conf-5.html)
