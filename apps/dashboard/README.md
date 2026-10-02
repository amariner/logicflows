# Visor

Muestra el estado, las alarmas y los indicadores de las células en tiempo real. Una única base de código para web, PWA y Android, según [ADR-0002](../../docs/adr/0002-visor-multiplataforma.md): Ionic 9 y Angular 22 con componentes *standalone* y sin zone.js. La app Android se genera con Capacitor desde este mismo código (Hito 3).

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

## App Android

El proyecto Android está en `android/` y lo genera Capacitor 8 a partir de la build de producción del visor (LF-65, [ADR-0002](../../docs/adr/0002-visor-multiplataforma.md)):

- **Identificador** `io.github.amariner.logicflows` y nombre **LogicFlows**. El identificador no cambia nunca ([ADR-0014](../../docs/adr/0014-distribucion-de-la-app-android.md)).
- **Configuración de producción.** La app lleva dentro `android/config.json` en lugar del `config.json` de desarrollo.
- **Iconos y pantalla de arranque** derivados de los de la PWA (`public/icons`): icono adaptativo con fondo `#17324d`.
- **`pnpm android:sync`** compila el visor, copia la configuración de la app y ejecuta `cap sync android`. Hay que ejecutarlo después de actualizar dependencias: `cap sync` escribe en `android/capacitor.settings.gradle` rutas del almacén de pnpm que incluyen la versión de cada plugin. Se versiona el resultado.
- **No hace falta JDK ni Android SDK en local.** La CI compila el APK de depuración en cada pull request (trabajo **Android**) y lo deja como artefacto `logicflows-debug-apk` durante 7 días. Antes comprueba que `android:sync` no cambia nada de lo versionado.
- **Prueba en emulador** (LF-74). El trabajo **Android en emulador** de la CI instala ese APK en un emulador con API 34 y ejecuta `android/prueba-emulador.sh`. Comprueba que la vista web carga sin errores del visor y que, sin sesión, el inicio de sesión se abre en el navegador del sistema. Encontró que `URL.canParse` no existe en vistas web anteriores a Chrome 120: una regla de ESLint lo impide.

- **Comportamiento de app** (LF-70):
  - El botón atrás retrocede en la navegación y, en la pantalla inicial, cierra la app.
  - El service worker de la PWA no se registra: la aplicación ya va dentro del APK.
- **Avisos de alarmas** (LF-69, [ADR-0015](../../docs/adr/0015-avisos-de-alarmas-en-el-movil.md)):
  - Tras iniciar sesión, la app pide permiso de notificaciones, crea el canal «Alarmas» y registra su token de Firebase Cloud Messaging en la API.
  - Tocar un aviso abre las células.
  - En el menú, **Avisos de alarmas** permite desactivarlos en el dispositivo.
  - Al cerrar sesión, el dispositivo se da de baja.
  - La app necesita `android/app/google-services.json`, del proyecto de Firebase. Sin él se compila igual, pero no recibe avisos.
- **Vuelta del segundo plano**, también en el navegador. Si la conexión no estaba abierta, o pasaron más de 30 segundos, el visor recarga el estado y reconecta sin esperar. Mientras tanto indica «Conectando…»: Android congela la vista web y la red cambia en segundo plano, así que una conexión que parece abierta puede estar muerta.

- **Inicio de sesión** (LF-68, RFC 8252):
  - Se abre en el navegador del sistema (Custom Tabs, `@capacitor/browser`), nunca en la vista web.
  - Keycloak vuelve a la app por su esquema propio, `io.github.amariner.logicflows:/callback`, y la app intercambia el código por los tokens con PKCE.
  - Si se cierra el navegador sin terminar, el visor ofrece reintentar.
  - En producción hay que habilitarlo una vez en Keycloak y en la API ([procedimiento](../../infra/keycloak/README.md#habilitar-la-app-android-en-producción-lf-68)).

## Compresión

Los ficheros del visor se comprimen con gzip al construir la imagen y Nginx los sirve tal cual (`gzip_static`), sin comprimir en cada petición (LF-59). `config.json` no se comprime, porque se genera al arrancar. En una red móvil lenta («Fast 3G», CPU ×4), comprimir redujo lo transferido de 883 a 235 KB y el tiempo hasta ver datos de 8,0 a 4,5 s.

El spike de LF-56 comparó además el renderizado en el servidor (SSR): adelanta el primer pintado, pero no la llegada de los datos, que dependen de la sesión del navegador. No se adopta.

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
| `android:sync` | Build de producción con la configuración de la app y sincronización del proyecto Android |
| `typecheck` | Comprueba los tipos de la aplicación y de las pruebas |
| `lint` | ESLint, incluidas las plantillas |
| `test` | Pruebas unitarias con Vitest y jsdom |
| `test:a11y` | Build de producción y comprobación de accesibilidad en Chromium con Playwright y axe-core |
