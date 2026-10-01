# Visor

Muestra el estado, las alarmas y los indicadores de las células en tiempo real. Una única base de código para web, PWA y Android, según [ADR-0002](../../docs/adr/0002-visor-multiplataforma.md): Ionic 9 y Angular 22 con componentes *standalone* y sin zone.js. Capacitor se incorporará con la aplicación Android (Hito 3).

## Estado actual

Esqueleto (LF-24), producción en tiempo real (LF-28) y panel de estado (LF-34): estructura con menú lateral fijo en escritorio y desplegable en móvil (`ion-split-pane`), modo visual `md` y una tarjeta por célula con su estado, sus alarmas activas, el contador de cajas y el estado del robot y de la cinta, actualizados en cuanto la API recibe un mensaje. El diseño sigue [Diseño del visor](../../docs/diseno-del-visor.md).

## Panel de estado

- **Estado** de ADR-0003 con icono, texto y un tono de color con contraste AA en tema claro y oscuro (tokens `--lf-tone-*` en `src/theme/variables.scss`). Solo los estados que requieren atención (espera, fallo y parada de emergencia) colorean el borde de la tarjeta.
- **Alarmas activas** de más a menos grave, con la severidad escrita, el código, el mensaje y la hora de activación.
- **Aviso global** en la parte superior cuando alguna célula está en parada de emergencia, anunciado a los lectores de pantalla (`role="alert"`).
- Estado del robot y de la cinta en texto.

## Indicadores de producción

`ProductionIndicatorsComponent` muestra el contador de cajas destacado y, debajo, pallets, capa en curso, ritmo (cajas/h) y tiempo de ciclo (s, con un decimal), con la barra de avance del pallet en curso descrita para lectores de pantalla. Las cifras usan separador de miles y ancho fijo; las unidades se escriben siempre y se muestran más pequeñas. Sin datos se muestra «—», nunca un cero. Se actualizan con cada telemetría y se atenúan cuando la célula está desconectada.

## Tiempo real

`RealtimeService` expone como *signals* el estado de la conexión y las células. Al arrancar:

1. Carga el estado actual por REST (`GET /api/v1/cells`), para mostrar datos en cuanto se abre el visor.
2. Abre el WebSocket de la API ([ADR-0006](../../docs/adr/0006-canal-de-tiempo-real.md)), que envía una instantánea y cada cambio.
3. Si la conexión se pierde, reconecta con espera exponencial (de 1 a 30 segundos) y una variación aleatoria que evita que todos los visores reconecten a la vez. Al reconectar recibe una instantánea nueva.

Las fuentes pueden llegar en cualquier orden, así que **para cada tipo de mensaje se conserva siempre el más reciente** (misma sesión: mayor secuencia; otra sesión: marca de tiempo posterior, como en ADR-0004). Una respuesta REST tardía o un mensaje retrasado nunca hacen retroceder lo que se muestra.

El indicador de la barra superior combina icono, texto y color (**En directo**, **Conectando…**, **Sin conexión**) y anuncia los cambios a los lectores de pantalla. Si una célula se desconecta, su tarjeta lo indica y muestra el último dato conocido.

Latencia medida en local desde que el simulador publica una caja hasta que cambia el número en pantalla: menos de 10 ms.

## Uso

Con el entorno local, la API y el simulador en marcha (`pnpm infra:up`, `pnpm api` y `pnpm simulator`):

```sh
pnpm dashboard
```

El visor se sirve en `http://localhost:4200` y pide iniciar sesión en Keycloak con un usuario de pruebas de [`infra/keycloak`](../../infra/keycloak), por ejemplo `operario` / `operario-local`.

## Inicio de sesión

Con `auth` en `config.json`, el visor usa OpenID Connect con Authorization Code y PKCE ([ADR-0009](../../docs/adr/0009-autenticacion-y-autorizacion.md)), con la librería certificada `angular-auth-oidc-client`:

- **Sesión.** Una guarda comprueba la sesión antes de mostrar las vistas. Sin sesión, lleva al inicio de sesión del proveedor, que devuelve al usuario a `/cells`.
- **Renovación.** El token de acceso dura 5 minutos y se renueva 30 segundos antes de caducar con el token de refresco.
- **Token solo hacia la API.** Se añade a las peticiones a `apiUrl` y a ninguna otra.
- **Tiempo real.** Cada conexión pide antes un tique a la API. Si la API la cierra con el código `4401`, el visor pide otro tique y reconecta.
- **Menú.** Muestra el nombre del usuario y el botón **Cerrar sesión**, que también cierra la sesión en el proveedor.

## Configuración

La configuración que depende del entorno se lee **al arrancar** desde `config.json`, no al compilar: la misma build sirve en todos los entornos, y cada despliegue proporciona su propio `config.json`.

| Campo | Ejemplo | Descripción |
|---|---|---|
| `apiUrl` | `http://localhost:3000` | URL base de la API. El canal de tiempo real se deriva de ella (`ws://…/realtime`, o `wss://` con `https`). |
| `auth.issuer` | `http://localhost:8180/realms/logicflows` | Emisor OpenID Connect ([ADR-0009](../../docs/adr/0009-autenticacion-y-autorizacion.md)). |
| `auth.clientId` | `logicflows-visor` | Cliente público del visor en el proveedor. |

Sin `auth`, el visor no pide sesión. Solo tiene sentido con una API simulada, como en las pruebas de accesibilidad: la API real rechaza las peticiones sin token.

En la imagen Docker, `config.json` se genera al arrancar a partir de `API_URL`, `AUTH_ISSUER` y `AUTH_CLIENT_ID`.

## Visor instalable (PWA)

El visor se puede instalar en el escritorio o en el móvil (LF-55, [ADR-0002](../../docs/adr/0002-visor-multiplataforma.md)):

- **Manifiesto.** `public/manifest.webmanifest`, con nombre, colores e iconos de LogicFlows, incluido uno *maskable* para Android. Se abre en `/cells` y sin la barra del navegador.
- **Service worker de Angular** (`ngsw-config.json`), solo en la build de producción:
  - Guarda la aplicación para que arranque al instante.
  - De `config.json` guarda la última copia, para poder arrancar sin conexión.
  - **Nunca guarda datos de planta.**
- **Sin conexión.** El visor no redirige al inicio de sesión ni muestra datos antiguos: indica que necesita conexión para mostrar datos en directo y vuelve a intentarlo al recuperarla.
- **Versiones nuevas.** Cuando hay una versión nueva descargada, un aviso ofrece **Actualizar**; se activa al recargar.
- **Caché en Nginx.** `ngsw-worker.js`, `ngsw.json` y el manifiesto se sirven sin caché, para detectar enseguida una versión nueva.

La prueba de extremo a extremo comprueba el manifiesto, el service worker y el comportamiento sin conexión.

## Cabeceras de seguridad

Nginx sirve el visor con una política de seguridad de contenidos generada al arrancar el contenedor, porque depende de la URL de la API y del emisor:

- **Conexiones.** `connect-src` solo admite el propio visor, la API (HTTP y WebSocket) y el proveedor de identidad.
- **Scripts.** Solo los del propio visor, nunca en línea. Por eso la build de producción desactiva `inlineCritical`: el script en línea con el que Angular carga la hoja de estilos de forma diferida quedaría bloqueado.
- **Estilos.** Admiten `'unsafe-inline'`, porque Ionic aplica estilos en línea a sus componentes.
- **Otras cabeceras.** `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y HSTS.

La prueba de extremo a extremo falla si el navegador registra alguna violación de la política.

El fichero de desarrollo está en `public/config.json`. Un valor no válido detiene el arranque con un mensaje que indica el problema.

## Estructura

Organizada por funcionalidades:

| Ruta | Contenido |
|---|---|
| `src/app/core/` | Servicios transversales: configuración de ejecución, canal de tiempo real e indicador de conexión |
| `src/app/features/cells/` | Funcionalidad de células: página, tarjeta, lista, aviso de emergencia, presentación de estados y alarmas, y modelo de vista |
| `src/testing/` | Ayudantes de pruebas: WebSocket falso, proveedores comunes y vistas de célula |
| `src/app/app.component.*` | Estructura de la aplicación y menú |
| `src/app/app.routes.ts` | Rutas, con carga diferida de cada página |

Los tipos de estados y mensajes se importan de `@logicflows/contract`. El empaquetador de Angular no admite condiciones de exportación propias, así que el visor lee el código fuente del contrato mediante `paths` en `tsconfig.json`. El contrato se declara sin efectos secundarios (`sideEffects: false`): Zod no entra en el bundle mientras el visor solo use tipos y constantes.

## Accesibilidad (WCAG 2.2 AA)

- **Comprobación automática** (`pnpm --filter @logicflows/dashboard test:a11y`): Playwright sirve la build de producción, simula la API con una célula en cada estado (incluida una desconectada) y pasa axe-core con las reglas WCAG 2.2 A y AA en tema claro y oscuro y en escritorio, tableta y móvil. Además comprueba el reajuste a 320 px sin desplazamiento horizontal (1.4.10), el idioma de la página y la navegación por teclado al menú en escritorio y en móvil. Se ejecuta en la CI en cada pull request.
- **Contraste:** los tonos `--lf-tone-*` están calculados para 4,5:1 en ambos temas. Se verificó que la comprobación detecta un tono insuficiente.
- **Teclado:** la zona de contenido es una región enfocable y etiquetada, para poder desplazarla con el teclado; los controles tienen etiquetas en español.
- ESLint incluye las reglas de accesibilidad de las plantillas de angular-eslint.
- El viewport permite ampliar la página (1.4.4).

## Calidad
- Presupuesto de tamaño: aviso a partir de 1 MB de carga inicial y error a partir de 2 MB.

## Scripts

| Script | Qué hace |
|---|---|
| `dev` | Servidor de desarrollo con recarga |
| `build` | Build de producción en `www` |
| `typecheck` | Comprueba los tipos de la aplicación y de las pruebas |
| `lint` | ESLint, incluidas las plantillas |
| `test` | Pruebas unitarias con Vitest y jsdom |
| `test:a11y` | Build de producción y comprobación de accesibilidad en Chromium con Playwright y axe-core |
