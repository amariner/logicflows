# Visor

Muestra el estado, las alarmas y los indicadores de las células en tiempo real. Una única base de código para web, PWA y Android, según [ADR-0002](../../docs/adr/0002-visor-multiplataforma.md): Ionic 9 y Angular 22 con componentes *standalone* y sin zone.js. Capacitor se incorporará con la aplicación Android (Hito 3).

## Estado actual

Esqueleto (LF-24), producción en tiempo real (LF-28) y panel de estado (LF-34): estructura con menú lateral fijo en escritorio y desplegable en móvil (`ion-split-pane`), modo visual `md` y una tarjeta por célula con su estado, sus alarmas activas, el contador de cajas y el estado del robot y de la cinta, actualizados en cuanto la API recibe un mensaje. El diseño sigue [Diseño del visor](../../docs/diseno-del-visor.md).

## Panel de estado

- **Estado** de ADR-0003 con icono, texto y un tono de color con contraste AA en tema claro y oscuro (tokens `--lf-tone-*` en `src/theme/variables.scss`). Solo los estados que requieren atención (espera, fallo y parada de emergencia) colorean el borde de la tarjeta.
- **Alarmas activas** de más a menos grave, con la severidad escrita, el código, el mensaje y la hora de activación.
- **Aviso global** en la parte superior cuando alguna célula está en parada de emergencia, anunciado a los lectores de pantalla (`role="alert"`).
- Estado del robot y de la cinta en texto.

## Tiempo real

`RealtimeService` abre al arrancar el WebSocket de la API ([ADR-0006](../../docs/adr/0006-canal-de-tiempo-real.md)) y expone como *signals* el estado de la conexión y las células. Aplica la instantánea inicial y cada cambio, y si la conexión se pierde reconecta con espera exponencial (de 1 a 30 segundos) y una variación aleatoria que evita que todos los visores reconecten a la vez. Al reconectar recibe una instantánea nueva, así que no pierde información.

El indicador de la barra superior combina icono, texto y color (**En directo**, **Conectando…**, **Sin conexión**) y anuncia los cambios a los lectores de pantalla. Si una célula se desconecta, su tarjeta lo indica y muestra el último dato conocido.

Latencia medida en local desde que el simulador publica una caja hasta que cambia el número en pantalla: menos de 10 ms.

## Uso

Con el entorno local, la API y el simulador en marcha (`pnpm infra:up`, `pnpm api` y `pnpm simulator`):

```sh
pnpm dashboard
```

El visor se sirve en `http://localhost:4200`.

## Configuración

La configuración que depende del entorno se lee **al arrancar** desde `config.json`, no al compilar: la misma build sirve en todos los entornos, y cada despliegue proporciona su propio `config.json`.

| Campo | Ejemplo | Descripción |
|---|---|---|
| `apiUrl` | `http://localhost:3000` | URL base de la API. El canal de tiempo real se deriva de ella (`ws://…/realtime`, o `wss://` con `https`). |

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

## Calidad

- ESLint con la configuración común más las reglas de Angular y de **accesibilidad de las plantillas**.
- El viewport permite ampliar la página (WCAG 1.4.4).
- Presupuesto de tamaño: aviso a partir de 1 MB de carga inicial y error a partir de 2 MB.

## Scripts

| Script | Qué hace |
|---|---|
| `dev` | Servidor de desarrollo con recarga |
| `build` | Build de producción en `www` |
| `typecheck` | Comprueba los tipos de la aplicación y de las pruebas |
| `lint` | ESLint, incluidas las plantillas |
| `test` | Pruebas unitarias con Vitest y jsdom |
