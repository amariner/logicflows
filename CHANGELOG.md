# Registro de cambios

Los cambios relevantes de cada versión de LogicFlows. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones, [versionado semántico](https://semver.org/lang/es/). Mientras la versión mayor sea 0, el contrato y la API pueden cambiar entre versiones menores.

## [Sin publicar]

### Añadido

- **Resumen de hoy en cada tarjeta** del panel de estado: cajas y disponibilidad desde la medianoche (LF-91).
- **Descargar el histórico en CSV** desde la vista de histórico, también en la app Android (LF-88).
- **«Hoy» se actualiza solo** cada minuto en la vista de histórico (LF-87).
- **Registro de estados y alarmas** (LF-84): `GET …/events` devuelve los cambios de estado, con sus alarmas y su duración, y los de conexión de un periodo. La vista de histórico los muestra.
- **Vista de histórico en el visor** (LF-81): desde la tarjeta de cada célula, la producción de hoy, de 7 o de 30 días, con su disponibilidad, su rendimiento y las paradas por causa. Incluye un gráfico accesible con su tabla equivalente.
- **Histórico e indicadores de planta en la API** (LF-80): `GET /api/v1/sites/{siteId}/cells/{cellId}/history` devuelve la producción, los tiempos, la disponibilidad, el rendimiento y las paradas por causa de un periodo, en total y por horas o por días en la zona horaria pedida. El ritmo nominal se configura con `NOMINAL_BOXES_PER_HOUR` y `NOMINAL_BOXES_PER_HOUR_BY_CELL`.
- **Histórico agregado por hora** (ADR-0016, LF-79), con retención configurable del dato en bruto.
- **Copias de seguridad de PostgreSQL** (ADR-0017, LF-82): imagen `logicflows-backup` con el volcado diario a un bucket y la restauración de prueba, probadas en la CI con un PostgreSQL y un bucket de prueba. Su activación en producción, que tiene coste, la aprueba el Tech Lead.

### Cambiado

- La producción por periodo (`/production`) toma las horas completas del histórico agregado: cuesta lo mismo con 90 días de histórico que con uno y no depende de que se conserve el dato en bruto. El resultado no cambia.

### Corregido

- El broker solo guardaba 1 000 mensajes para la API mientras estaba caída o desplegándose, y descartaba el resto sin avisar. Ahora guarda 50 000, suficientes para la hora de su sesión persistente con unas 20 células (LF-90).
- El histórico, el registro y la producción de una célula con datos guardados, pero sin estado en tiempo real, respondían 404 (LF-85).

## [0.2.0] - 2026-10-02

**Hito 2 · Sistema desplegado.** LogicFlows funciona en Internet: producción en Railway con inicio de sesión, una célula de demostración en directo, despliegues por versión descritos como código, una previsualización por pull request bajo demanda y métricas con alertas.

### Añadido

- **Producción en Railway** (ADR-0008), en la región europe-west4 (Ámsterdam): visor, API, broker, proveedor de identidad, PostgreSQL y la célula de demostración, con dominios HTTPS. Cada servicio tiene su propio usuario de PostgreSQL, y los secretos están sellados con procedimientos de rotación probados (LF-48).
- **Autenticación con OpenID Connect y Keycloak** (ADR-0009, LF-50 y LF-51):
  - La API valida firma, caducidad, emisor y audiencia de los tokens.
  - Roles `viewer` y `admin`.
  - El visor inicia sesión con PKCE y obtiene tiques de un solo uso para el WebSocket.
- **Imágenes del broker y del proveedor de identidad** (ADR-0010, LF-61): Mosquitto con su configuración y ACL, y Keycloak con el realm de producción sin usuarios. Local, CI y producción ejecutan la misma imagen.
- **Previsualización por pull request bajo demanda** (ADR-0012, LF-53):
  - Se pide con la etiqueta `previsualizacion`.
  - Crea un entorno `pr-<n>` con las imágenes de la PR y ejecuta las pruebas de extremo a extremo contra él.
  - Se borra al quitar la etiqueta o al cerrar la PR.
- **Observabilidad** (ADR-0013, LF-54):
  - La API publica métricas Prometheus en `/metrics`, protegidas con su propio token: ingesta, tiempo real, dependencias, cada célula y Node.js.
  - Las tres aplicaciones escriben sus registros en JSON, que Railway filtra por campo y nivel.
  - `infra/grafana/` describe como código el panel de producción y tres alertas para Grafana Cloud.
- Prueba de extremo a extremo contra producción después de cada despliegue, con un usuario de solo lectura. Si falla, abre una incidencia con los pasos para volver atrás (LF-57).
- Infraestructura de producción como código en `.railway/railway.ts` (ADR-0011, LF-49):
  - Cada PR que la cambia muestra el plan, y al fusionarla se aplica.
  - Desplegar una versión o volver atrás consiste en cambiar la etiqueta de las imágenes.
  - Railway no envía tráfico a un servicio hasta que pasa su comprobación de salud; la API, solo con las migraciones aplicadas.
  - El broker guarda sus datos en un volumen y admite células desde Internet por `wss://`.
- MQTT sobre WebSocket: el broker escucha también en el puerto 9001 y la API y el simulador admiten URL `ws://` y `wss://`. Es la vía de las células en producción (ADR-0008, LF-49).
- Compresión de los ficheros del visor al construir la imagen: en una red móvil lenta, los datos aparecen en 4,5 s en lugar de 8 s (LF-59).
- Visor instalable como PWA (LF-55):
  - Manifiesto con iconos propios y service worker que guarda solo la aplicación.
  - Aviso de versión nueva.
  - Sin conexión, indica que no hay datos en directo.
- Endurecimiento (LF-52):
  - **API:** cabeceras de seguridad, límite de peticiones por cliente con `429` y tamaño máximo de peticiones y mensajes WebSocket.
  - **Visor:** política de seguridad de contenidos en Nginx.
  - **CI:** auditoría de dependencias.
- Publicación de las imágenes en GitHub Container Registry para amd64 y arm64. Cada versión etiqueta las imágenes ya probadas de su commit, sin recompilar (LF-45).

### Cambiado

- La protección de `main` exige pull request, *Rebase and merge* y las comprobaciones de la CI en verde, también para los administradores. El repositorio es público (LF-16).
- Cada instancia de la API usa un identificador MQTT propio, derivado por defecto del nombre de su equipo o contenedor. Varias instancias pueden funcionar a la vez contra el mismo broker y la misma base de datos (LF-47).

### Corregido

- La API ya no se detiene si PostgreSQL cierra una conexión inactiva: la siguiente consulta abre otra y `/health/ready` informa mientras la base de datos no está disponible (LF-62).
- Una prueba del tiempo real fallaba de forma intermitente porque publicaba antes de recibir la instantánea (LF-60).

### Limitaciones conocidas

- El panel y las alertas de Grafana Cloud necesitan que el titular de la cuenta los ponga en marcha (`infra/grafana/README.md`); hasta entonces, `/metrics` responde 404 en producción.
- Las previsualizaciones que se olvidan abiertas no se borran solas: se borran al cerrar la PR.
- Producción tiene una sola réplica de cada servicio; un despliegue corta unos segundos el tiempo real, y el visor se reconecta solo.

## [0.1.0] - 2026-10-01

**Hito 1 · Primera caja en pantalla.** Primera versión que monitoriza de extremo a extremo una célula robotizada de paletizado simulada: el estado de la máquina, la producción y las alarmas llegan en tiempo real a un visor web adaptable y accesible.

### Añadido

- **Simulador de célula de paletizado** (`apps/simulator`):
  - Ciclo realista con variación del tiempo de ciclo, capas y cambio de pallet.
  - Máquina de siete estados alineada con PackML (ADR-0003), con esperas por falta de cajas o salida ocupada.
  - Fallos y paradas de emergencia con alarmas y recuperación.
  - Escenarios `normal`, `turno`, `averias`, `red-inestable` y `demo`, con cortes de red, mensajes duplicados y desordenados.
- **Contrato de telemetría** (`packages/contract`): topics MQTT versionados, mensajes `status`, `state` y `telemetry`, tipos y validación con Zod y JSON Schema, compartidos por las tres aplicaciones (ADR-0004 y ADR-0005).
- **API** (`apps/api`, NestJS):
  - Ingesta MQTT 5 con sesión persistente que valida cada mensaje y descarta duplicados y desordenados.
  - Estado actual de cada célula, recuperado de la base de datos al arrancar.
  - Persistencia idempotente en PostgreSQL con migraciones versionadas (ADR-0007).
  - API REST `/api/v1` con estado actual y producción por periodo, errores RFC 9457 y documentación OpenAPI en `/docs`.
  - Canal WebSocket `/realtime` con instantánea al conectar y cambios en tiempo real (ADR-0006).
  - Salud en `/health/live` y `/health/ready`, y registros JSON.
- **Visor** (`apps/dashboard`, Ionic y Angular, ADR-0002):
  - Panel de células con estado, robot, cinta y alarmas ordenadas por severidad.
  - Aviso global de parada de emergencia.
  - Indicadores de producción: cajas, pallets, capa, ritmo y tiempo de ciclo.
  - Estado de la conexión con reconexión automática; combina REST y tiempo real y gana el dato más nuevo.
  - Diseño ISA-101 adaptable a escritorio, tableta y móvil, en tema claro y oscuro, y accesible según WCAG 2.2 AA.
  - Configuración en tiempo de ejecución con `config.json`.
- **Entrega y operación:**
  - Imágenes Docker multietapa de las tres aplicaciones, sin privilegios y configurables solo con variables de entorno.
  - Docker Compose para la infraestructura local (`pnpm infra:up`) y para el sistema completo (`pnpm stack:up`).
- **Calidad:**
  - Monorepo con pnpm workspaces y TypeScript estricto (ADR-0001), ESLint y Prettier comunes.
  - Pruebas unitarias con Vitest, de integración con Testcontainers (Mosquitto y PostgreSQL reales), de accesibilidad con axe-core y de extremo a extremo con Playwright.
  - Integración continua en cada pull request.
- **Documentación:** arranque rápido, diagrama de arquitectura, siete ADR, estrategia de pruebas, diseño del visor y guía de contribución.

### Limitaciones conocidas

- Sin autenticación: el sistema está pensado para ejecutarse en local. La autenticación, el endurecimiento y el despliegue llegan en el Hito 2.
- La API mantiene el estado en memoria y no admite aún varias réplicas: cada instancia necesitaría su propio identificador de cliente MQTT.
- La rama `main` no tiene protección técnica: la exige una decisión pendiente sobre la visibilidad del repositorio.

[Sin publicar]: https://github.com/amariner/logicflows/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/amariner/logicflows/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/amariner/logicflows/releases/tag/v0.1.0
