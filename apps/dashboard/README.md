# Visor

Muestra el estado, las alarmas y los indicadores de las células en tiempo real. Una única base de código para web, PWA y Android, según [ADR-0002](../../docs/adr/0002-visor-multiplataforma.md): Ionic 9 y Angular 22 con componentes *standalone* y sin zone.js. Capacitor se incorporará con la aplicación Android (Hito 3).

## Estado actual

Esqueleto (LF-24): estructura con menú lateral fijo en escritorio y desplegable en móvil (`ion-split-pane`), modo visual `md` en todas las plataformas, página de células y configuración en tiempo de ejecución. Los datos en tiempo real llegan con LF-28.

## Uso

Con la API en marcha (`pnpm api`):

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
| `src/app/core/` | Servicios transversales: configuración de ejecución |
| `src/app/features/cells/` | Funcionalidad de células: página, lista y modelo de vista |
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
