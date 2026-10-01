# Estrategia de pruebas

Este documento define qué se prueba en cada nivel, con qué herramientas y cómo se ejecuta. El objetivo es detectar las regresiones lo antes posible y al menor coste: la mayoría de los errores deben aparecer en segundos, en local, y no en la revisión ni en producción.

## Principios

1. **Probar el comportamiento, no la implementación.** Una prueba describe lo que el sistema hace para quien lo usa y no se rompe al refactorizar.
2. **Dependencias reales cuando el riesgo está en la integración.** El broker MQTT y PostgreSQL no se simulan en las pruebas de integración: los errores más probables están en la configuración de QoS, los mensajes retenidos, las restricciones SQL o las migraciones, y una simulación los ocultaría.
3. **Determinismo.** El resultado de una prueba no depende de la hora, del orden de ejecución ni del azar. El código de dominio recibe el reloj y la fuente de aleatoriedad como dependencias, de modo que las pruebas los controlan.
4. **Rapidez proporcional al nivel.** Las pruebas unitarias se ejecutan en cada guardado; las de integración, antes de abrir una pull request y en la CI; las de extremo a extremo, en la CI.
5. **Una prueba inestable es un error.** Si una prueba falla de forma intermitente, se corrige o se desactiva con una tarea de Jira asociada en menos de un día laborable. Nunca se reintenta hasta que pase.

## Niveles

| Nivel | Qué cubre | Dependencias | Herramientas | Cuándo se ejecuta |
|---|---|---|---|---|
| **Unitarias** | Lógica de dominio y componentes aislados | Ninguna externa | Vitest | `pnpm test`, en cada cambio y en la CI |
| **Integración** | Un servicio con su broker y su base de datos reales | Contenedores efímeros | Vitest y Testcontainers | `pnpm test:integration`, antes de abrir una pull request y en la CI |
| **Extremo a extremo** | Flujos críticos del usuario con el sistema completo | Imágenes de las aplicaciones en Docker Compose | Playwright | En la CI |

### Unitarias

Cubren la lógica que decide algo:

- **Contrato de telemetría:** validación de mensajes válidos e inválidos de cada tipo ([ADR-0004](adr/0004-mensajes-de-telemetria-y-topics-mqtt.md)).
- **Simulador:** la máquina de estados de [ADR-0003](adr/0003-estados-de-la-paletizadora.md). Cada fila de su tabla de transiciones es un caso de prueba, incluidas las transiciones no permitidas.
- **API:** las reglas de duplicados, desorden, pérdidas y reinicios de ADR-0004; el cálculo de producción por diferencia de contadores; la transformación de mensajes en eventos para el visor.
- **Visor:** servicios, transformación de datos para la interfaz y componentes con lógica propia, con `TestBed` de Angular sobre Vitest.

No se prueban por separado el código del framework, la configuración declarativa ni los accesos triviales a propiedades.

### Integración

Cada servicio se prueba con dependencias reales creadas por Testcontainers para cada fichero de pruebas y destruidas al terminar. Las pruebas no comparten estado entre sí ni con el entorno local de desarrollo.

- **Ingesta:** un mensaje publicado en Mosquitto llega a la API, se valida y se persiste en PostgreSQL. Incluye duplicados reales de QoS 1, mensajes retenidos al reiniciar y la sesión persistente.
- **Persistencia:** repositorios y migraciones contra PostgreSQL 18.
- **API completa:** la aplicación NestJS arrancada con sus módulos reales, con peticiones REST y conexiones WebSocket reales.
- **Configuración del broker:** la configuración de `infra/mosquitto` (autenticación y listas de control de acceso) se usa también en estas pruebas.

Los contenedores usan las mismas imágenes y versiones que `compose.yaml`.

### Extremo a extremo

Pocos flujos, los que demuestran que el producto funciona. Se ejecutan con Playwright contra el sistema completo en contenedores (`pnpm stack:up`, perfil `apps` de Compose), sin dobles de ningún tipo:

- **Una caja simulada aparece en el visor** (LF-39): el usuario inicia sesión en Keycloak y el visor muestra la célula produciendo. Sin recargar, el contador de cajas aumenta. La caja recorre el simulador, el broker, la API y el canal en tiempo real, con un token y un tique reales.

Para ejecutarlas en local:

```sh
pnpm stack:up
pnpm test:e2e
```

La prueba espera al escenario `normal` del simulador, el de `.env.example`. Con incidencias, la célula podría estar parada justo durante la prueba.

Que una célula en fallo se destaque en el visor se comprueba con los componentes y con las pruebas de accesibilidad, que usan datos de ejemplo. Provocar un fallo en el sistema completo exigiría poder dar órdenes al simulador desde fuera. Se valorará cuando haya comandos hacia la célula.

## Convenciones

- Las pruebas viven junto al código que prueban: `estado.ts` y `estado.spec.ts`.
- Las pruebas de integración se nombran `*.integration.spec.ts` y se excluyen de `pnpm test`.
- Cada paquete expone `test` y, si las tiene, `test:integration`. La raíz los agrega en `pnpm test` y `pnpm test:integration`.
- Los nombres de las pruebas describen el comportamiento en español: `descarta un mensaje con una secuencia ya procesada`.
- Los datos de prueba se construyen con funciones del paquete del contrato que generan mensajes válidos y permiten modificar solo lo relevante para cada caso.

## Cobertura

Se mide con el proveedor V8 de Vitest y se publica en cada ejecución de la CI.

- **Umbral orientativo:** 80 % de líneas y ramas en la lógica de dominio (contrato, simulador y reglas de la API).
- No hay un umbral global que bloquee la CI. La cobertura indica qué código no se prueba, no si las pruebas son buenas: la revisión valora si los casos relevantes están cubiertos.

## Herramientas

| Herramienta | Versión | Uso |
|---|---|---|
| Vitest | 5 | Pruebas unitarias y de integración de todos los paquetes |
| @vitest/coverage-v8 | 5 | Cobertura |
| Testcontainers | 12 | Contenedores efímeros de Mosquitto y PostgreSQL |
| Playwright | 1.63 | Pruebas de extremo a extremo del visor |

**Vitest como único ejecutor.** Angular 22 lo usa por defecto, NestJS 12 lo ofrece como alternativa oficial a Jest y funciona sin configuración en Node.js con TypeScript y módulos ES. Un único ejecutor significa una sola sintaxis, una sola configuración de cobertura y un solo informe para todo el monorepo.

**Testcontainers frente al entorno de Docker Compose.** Compose sirve para desarrollar; las pruebas necesitan aislamiento. Con Testcontainers cada fichero de pruebas tiene su broker y su base de datos limpios, se pueden ejecutar en paralelo y funcionan igual en local y en la CI, sin depender de que alguien haya ejecutado `pnpm infra:up`.

**Sin pruebas de contrato entre servicios.** El contrato se comparte como paquete del monorepo con tipos y validación (LF-21). Un cambio incompatible falla al compilar o en las pruebas del propio monorepo, así que herramientas como Pact no aportan valor mientras productores y consumidores vivan en el mismo repositorio.

## Requisitos para las pruebas de integración

Las pruebas de integración necesitan Docker. Con Docker Desktop, OrbStack y en la CI funcionan sin configuración. Con **Colima** hay que indicar a Testcontainers dónde está el socket de Docker:

```sh
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

Testcontainers instala dependencias con scripts de instalación opcionales (`cpu-features`, `ssh2` y `protobufjs`). No son necesarios y se deniegan en `allowBuilds` al añadir Testcontainers al primer paquete.

## Integración continua

| Trabajo | Contenido |
|---|---|
| Comprobaciones | Formato, tipos, lint, pruebas unitarias y build |
| Integración | Pruebas de integración con Testcontainers, desde que exista la primera (LF-26) |
| Accesibilidad | WCAG 2.2 AA con axe-core y Playwright sobre la build de producción del visor |
| Sistema completo | Construcción de las imágenes, arranque de `compose.yaml` con el perfil `apps` y la configuración de ejemplo, y prueba de extremo a extremo con Playwright |

Todos los trabajos se ejecutan en paralelo. Deben terminar en menos de 10 minutos, salvo el del sistema completo, que construye las imágenes y tiene 15.
