# LogicFlows

Plataforma IIoT para monitorizar en tiempo real células robotizadas de paletizado: estado de la máquina, producción y alarmas, desde la web y desde el móvil.

> **Estado:** en desarrollo. Hito actual: **Hito 1 · Primera caja en pantalla** (`v0.1.0`).

## Arquitectura

Un simulador de paletizadora publica telemetría por MQTT. Una API en NestJS la valida, la persiste en PostgreSQL y la expone por REST y WebSocket a un visor multiplataforma construido con Ionic y Angular.

## Estructura

Monorepo gestionado con pnpm workspaces ([ADR-0001](docs/adr/0001-gestor-de-paquetes-y-orquestacion.md)):

```text
logicflows/
├── apps/
│   ├── simulator/   # Simulador de la célula de paletizado
│   ├── api/         # API NestJS: ingesta MQTT, persistencia, REST y WebSocket
│   └── dashboard/   # Visor con Ionic, Angular y Capacitor
└── docs/
    └── adr/         # Decisiones de arquitectura
```

## Requisitos

- **pnpm 11.** La versión exacta está fijada en el campo `packageManager` de `package.json`. Con Corepack, incluido en Node.js, basta con ejecutar `corepack enable`.
- **Node.js.** No hace falta instalar una versión concreta: pnpm descarga y usa la fijada en `devEngines.runtime` (24.21.0). El fichero `.nvmrc` la declara también para editores y gestores de versiones.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala las dependencias de todo el workspace según `pnpm-lock.yaml` |
| `pnpm install --frozen-lockfile` | Instalación reproducible: falla si el lockfile no coincide con los `package.json` (la usa la CI) |
| `pnpm check` | Verificación completa: tipos, lint, pruebas y build de todos los paquetes |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` | Cada comprobación por separado en todos los paquetes |
| `pnpm --filter @logicflows/api <script>` | Ejecuta un script en un único paquete |

Cada paquete expone los mismos scripts (`typecheck`, `lint`, `test` y `build`) a medida que se implementa; los comandos de la raíz omiten los paquetes que aún no los definen. pnpm los ejecuta en orden topológico: un paquete se procesa después de aquellos de los que depende.

Las dependencias con scripts de instalación (`postinstall`) no los ejecutan salvo que se autoricen en `allowBuilds` de `pnpm-workspace.yaml`. Cada autorización se decide al revisar la pull request que añade la dependencia.

## Documentación

- [Decisiones de arquitectura (ADR)](docs/adr/README.md)
- [Guía de contribución y Definition of Done](CONTRIBUTING.md)
