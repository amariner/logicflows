# Registro de cambios

Los cambios relevantes de cada versión de LogicFlows. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones, [versionado semántico](https://semver.org/lang/es/). Mientras la versión mayor sea 0, el contrato y la API pueden cambiar entre versiones menores.

## [Sin publicar]

### Añadido

- **Reconocer alarmas desde el visor y la app** (ADR-0022, LF-128): botón «Reconocer» para `operator` y `admin` en la tarjeta y el detalle. La alarma reconocida sigue visible, sin fondo de color y con quién la atiende, y llega a los demás visores sin recargar. Los reconocimientos aparecen en el registro, y tocar el aviso en el móvil abre el detalle de la célula.
- **Reconocer alarmas en la API** (ADR-0022, LF-126): `POST …/alarms/{code}/acknowledgements` con el rol nuevo `operator`, una vez por activación. Llega a los visores en tiempo real y queda en el registro de eventos y en el log de auditoría.
- **Indicadores con el calendario de turnos** (ADR-0021, LF-125): una célula detenida (`STOPPED`) dentro de un turno es la parada «Detenida en turno» y resta disponibilidad; fuera de turno, todo sigue igual. El histórico y el CSV incluyen el tiempo de turno.
- **Calendario de turnos** por planta (ADR-0021, LF-124): versiones con fecha de entrada en vigor y excepciones por día, consultables con `viewer` y editables con `admin`, solo a futuro. La planta de la demo tiene turnos de mañana y tarde de lunes a viernes.
- **Varias células en el mismo simulador** (`SIMULATOR_CELLS`, LF-123): cada una con su conexión, su sesión y un perfil propio (guion desfasado, esperas más o menos largas y ritmo), para comparar células en la demo sin servicios nuevos.
- **Dosier de diseño** (`docs/diseno/dosier.md`): antes y después, pantallas en claro y oscuro y una lámina del sistema de diseño dibujada con los tokens reales, comprobada en la CI como captura de referencia (LF-104).

### Corregido

- La carga del histórico simulado va a 200 mensajes por segundo como mucho (`SIMULATOR_BACKFILL_RATE`): al cargar varias células, publicaba más deprisa de lo que la API guarda y el broker descartaba parte del histórico (LF-123).
- La prueba de producción ya no falla si coincide con una parada del guion diario de la demo: comprueba que llegan datos en tiempo real, no que la célula esté produciendo (LF-119).

## [0.5.0] - 2026-10-08

**Hito 5 · Rediseño visual.** El visor, el inicio de sesión y la app Android con un sistema de diseño propio en claro y oscuro, más visual para las demos y fiel a ISA-101: interfaz neutra y color intenso solo para lo anómalo. Incluye las acciones de la retrospectiva del Hito 4.

### Añadido

- **Tokens de diseño** (`@logicflows/design-tokens`, ADR-0020, LF-101): colores en claro y oscuro, tipografía (Inter y JetBrains Mono, incluidas en la aplicación), espaciado, radios y tonos de estado. Una prueba comprueba el contraste WCAG 2.2 AA de cada par de texto y fondo.
- **Tema claro y oscuro** en el visor (LF-105): sigue al sistema o se elige en el menú, y se recuerda.
- **Componentes base** (LF-103): etiqueta de estado, alarma, indicador y cabecera con «En directo».
- **Detalle de una célula** (`/cells/{siteId}/{cellId}`, LF-106), en tiempo real: estado, alarmas, el esquema de la cinta, el robot y el palé capa a capa, y la producción.
- **Resumen de estados** encima del panel: cuántas células hay en cada estado, de lo más grave a lo normal (LF-106).
- **Tema de Keycloak** con la marca de LogicFlows para el inicio de sesión (LF-108).
- **Capturas de referencia** de las pantallas clave en la CI (LF-110).
- **`pnpm --filter @logicflows/dashboard marca`:** genera los iconos y la pantalla de arranque de la PWA y de Android a partir del pictograma (LF-109).
- **Documentación de diseño:** [proceso](docs/diseno/proceso.md), [pantallas](docs/diseno/pantallas.md) y [diseño del visor](docs/diseno-del-visor.md) revisado (LF-110, LF-111).

### Cambiado

- Panel, tarjeta e histórico con el diseño nuevo (LF-106, LF-107).
- Icono y pantalla de arranque con los colores de la marca. El palé deja de ser ámbar, que en el visor significa «en espera» (LF-109).
- La API confirma al broker un cambio de estado solo después de guardarlo, y reintenta si PostgreSQL falla en lugar de descartarlo. Mientras PostgreSQL no responde, el tiempo real se detiene (ADR-0004, LF-117).
- El mensaje y la marca de su hora del histórico se guardan en la misma transacción (ADR-0016, LF-114).

### Corregido

- El visor podía entrar en un bucle de redirecciones si el inicio de sesión no se completaba. Ahora, tras dos intentos, se detiene y ofrece reintentar (LF-118).
- Pruebas que fallaban a veces: la agregación del histórico (LF-113) y el reloj virtual del simulador (LF-116).

### Para desplegar

- El tema de Keycloak se activa una sola vez en el realm de producción, que ya existe ([pasos](infra/keycloak/README.md)).

## [0.4.0] - 2026-10-07

**Hito 4 · Histórico y análisis.** Cierra el histórico que llegó a producción con `v0.3.0` (indicadores de planta, registro de estados y alarmas y descarga en CSV) y deja la demo lista para compradores. Producción mantiene una ventana fija de datos simulados que se repiten cada día, con un tamaño estable (unos 21 MB) y un consumo de unos 9,4 USD al mes. Incluye las correcciones de la prueba en móvil del Hito 3.

### Añadido

- **Escenario `guion` del simulador** (ADR-0019, LF-95): repite cada día un guion de esperas, pausas, fallos y una parada de emergencia a hora fija de Madrid. Las alarmas graves caen en horario laboral. El histórico simulado sigue el mismo guion.
- **Retención de los agregados por hora** (`HISTORY_AGGREGATES_RETENTION_DAYS`), y borrado diario de los avisos ya enviados (LF-95).
- **`infra/railway/cargar-ventana.sh`:** vacía el histórico de un entorno y lo vuelve a generar con el guion (LF-95).
- **`docs/datos-de-la-demo.md`:** cómo se generan, cargan, miden y compactan los datos de la demo, el consumo por servicio y el registro de mediciones, con `infra/postgres/medir-ventana.sql` para medir la ventana (LF-95, LF-96).

### Cambiado

- Keycloak usa un heap de Java fijo (256 MB) y caché local: en producción pasa de unos 750 a unos 430 MB de memoria, el mayor coste de la demo (LF-96).
- La API y el simulador limitan la generación joven del montón de Node (`--max-semi-space-size=8`): la API arranca en unos 140 MB en lugar de 250, sin limitar el montón total (LF-96).
- `cargar-ventana.sh` vuelve a arrancar el simulador en Ámsterdam: tras `railway down`, Railway lo desplegaba en la región por defecto (LF-96).
- Las copias de seguridad de PostgreSQL quedan preparadas, pero no se activan en producción: LogicFlows es una demostración con datos simulados. El procedimiento de activación y su coste revisado, menos de 0,60 USD al mes, están en `docs/despliegue.md` (ADR-0017, LF-82).
- La CI solo audita las dependencias en las pull requests que cambian el lockfile, y un flujo de trabajo diario audita `main` y abre una incidencia si hay avisos altos o críticos. Un aviso nuevo ya no bloquea pull requests que no tocan dependencias (LF-99).

### Corregido

- Los textos del visor, el CSV del histórico y las alarmas del simulador dicen «palé» y «palés» en lugar de «pallet». Los identificadores del contrato (`palletsTotal`, `pallet`…) no cambian, y las alarmas ya registradas conservan su texto (LF-93).
- El visor web mostraba «No se puede contactar con el servicio de inicio de sesión» al volver a una dirección de inicio de sesión ya usada, por ejemplo con **Atrás**, aunque la sesión seguía siendo válida. Ahora la descarta y conserva la sesión o la inicia de nuevo. Y si Keycloak no responde, muestra ese aviso con **Reintentar** en lugar de quedarse en blanco (LF-92).

### Seguridad

- `source-map-js` pasa a 1.2.2 por el aviso de severidad alta GHSA-68fv-2mgg-jv7q. Solo llegaba por dependencias de desarrollo (LF-98).

### Limitaciones conocidas

- Los datos son simulados: la ventana conserva 31 días de estados y agregados y 2 días de telemetría en bruto (ADR-0019). Las copias de seguridad están preparadas, pero no se activan (LF-82).
- La app Android se sigue distribuyendo como APK en las releases de GitHub, no en Google Play (ADR-0014).

## [0.3.0] - 2026-10-04

**Hito 3 · App Android (demo).** El visor llega al móvil como app Android generada desde el mismo código: inicia sesión en el navegador del sistema, avisa de las alarmas graves aunque esté cerrada y se publica firmada en cada versión. Probada en un móvil real contra producción.

Esta versión incluye también el histórico del Hito 4 (indicadores de planta, registro de estados y alarmas y descarga en CSV), que ya está en producción. Su entrega formal, con las copias de seguridad activadas, será `v0.4.0`.

### Añadido

- **App Android** con Capacitor (ADR-0002, LF-65): identificador `io.github.amariner.logicflows`, iconos derivados de la PWA y la configuración de producción dentro del APK. La CI compila el APK de depuración en cada pull request.
- **APK firmado en cada versión** (ADR-0014, LF-67): cada etiqueta `vX.Y.Z` compila el APK de release, lo firma con la clave del entorno `android-release` y lo adjunta a su release de GitHub con su SHA-256 y la huella del certificado. El `versionCode` se deriva de la etiqueta (`v0.3.0` → 300). Sin la clave, el flujo falla y no publica un APK sin firmar.
- **Inicio de sesión en la app** (LF-68, RFC 8252): en el navegador del sistema, nunca en la vista web, con vuelta a la app por su esquema propio y PKCE. La sesión sobrevive a que Android cierre la app mientras el inicio de sesión está en el navegador (LF-75).
- **Avisos de alarmas en el móvil** (ADR-0015, LF-69):
  - Las alarmas `CRITICAL` y `HIGH` y la parada de emergencia generan un aviso de Firebase Cloud Messaging, aunque la app esté cerrada.
  - Se avisa una vez por activación, también con varias réplicas o mensajes repetidos.
  - El aviso solo lleva la gravedad, la planta y la célula; nunca el texto de la alarma ni datos de producción.
  - La app pide permiso tras iniciar sesión y los avisos se pueden desactivar desde el menú.
  - `POST` y `DELETE /api/v1/push/devices` registran y dan de baja cada dispositivo.
- **Comportamiento de app** (LF-70): el botón atrás retrocede y, en la pantalla inicial, cierra la app; la app no registra el service worker de la PWA.
- **Vuelta del segundo plano**, también en el navegador (LF-70): si la conexión estaba cerrada o pasaron más de 30 segundos, el visor recarga el estado y reconecta sin esperar.
- **Prueba de la app en un emulador Android** en cada pull request (LF-74): comprueba que la vista web carga sin errores y que el inicio de sesión se abre en el navegador del sistema.
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

- El visor no arrancaba en vistas web anteriores a Chrome 120, que no tienen `URL.canParse`. Una regla de ESLint lo impide desde ahora (LF-74).
- Tras iniciar sesión, el visor volvía siempre a la lista de células en lugar de a la página pedida (LF-86).
- Railway apply terminaba antes que los despliegues, y la prueba de producción podía probar la versión anterior (LF-73).
- La API no avisa al móvil de alarmas antiguas, por ejemplo al cargar histórico simulado (LF-77).
- El broker solo guardaba 1 000 mensajes para la API mientras estaba caída o desplegándose, y descartaba el resto sin avisar. Ahora guarda 50 000, suficientes para la hora de su sesión persistente con unas 20 células (LF-90).
- El histórico, el registro y la producción de una célula con datos guardados, pero sin estado en tiempo real, respondían 404 (LF-85).

### Limitaciones conocidas

- La app Android se distribuye como APK en las releases de GitHub, no en Google Play: hay que permitir la instalación de apps desconocidas (ADR-0014).
- Las copias de seguridad están preparadas pero no activadas en producción: la retención del dato en bruto sigue apagada hasta activarlas (LF-82).
- El visor web puede mostrar una vez «No se puede contactar con el servicio de inicio de sesión» al abrirse; **Reintentar** lo resuelve (LF-92).
- Los textos dicen «Pallets» en lugar de «palés» (LF-93).

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

[Sin publicar]: https://github.com/amariner/logicflows/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/amariner/logicflows/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/amariner/logicflows/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/amariner/logicflows/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/amariner/logicflows/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/amariner/logicflows/releases/tag/v0.1.0
