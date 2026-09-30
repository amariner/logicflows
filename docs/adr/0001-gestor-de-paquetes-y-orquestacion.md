# ADR-0001: Gestor de paquetes y orquestación del monorepo

- **Estado:** Aceptado
- **Fecha:** 2026-09-30
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-11

## Contexto

LogicFlows se desarrolla como monorepo con tres aplicaciones y, previsiblemente, un paquete compartido:

- `simulator`: simulador de la célula de paletizado (Node.js y TypeScript).
- `api`: ingesta, persistencia y API (NestJS).
- `dashboard`: visor multiplataforma (Ionic y Angular).
- `contract`: tipos y validación del contrato de telemetría, compartido por las tres aplicaciones. La forma de compartirlo se decidirá en LF-21.

El repositorio necesita:

- Instalaciones reproducibles en local y en integración continua.
- Que cada paquete declare explícitamente las dependencias que utiliza.
- Ejecutar tareas (`build`, `test`, `lint`, `typecheck`) en todos los paquetes o en uno concreto, respetando las dependencias entre ellos. Por ejemplo, `contract` debe compilarse antes que las aplicaciones que lo consumen.
- Una configuración comprensible para cualquier persona que se incorpore al equipo.

## Opciones consideradas

**Gestor de paquetes:**

1. npm workspaces.
2. pnpm workspaces.

**Orquestación de tareas:**

1. Scripts del gestor de paquetes, sin orquestador dedicado.
2. Turborepo.
3. Nx.

## Decisión

1. Se usa **pnpm** con workspaces como gestor de paquetes.
2. **No se incorpora un orquestador dedicado** por ahora. Las tareas se ejecutan con los mecanismos de pnpm: `pnpm -r` para todo el workspace, en orden topológico, y `pnpm --filter` para un paquete concreto.
3. Se fijan las versiones de las herramientas:
   - **Node.js 24 LTS**, declarado en `.nvmrc` y en el campo `engines`.
   - **pnpm 11**, declarado en el campo `packageManager`, para que todo el equipo y la CI usen la misma versión.
4. Todos los paquetes exponen la misma **convención de scripts**: `build`, `test`, `lint` y `typecheck`. La raíz ofrece un comando de verificación completo, `pnpm check`, que es el mismo que ejecuta la CI.

## Justificación

**pnpm frente a npm:**

- **Aislamiento de dependencias.** Cada paquete solo puede importar lo que declara en su `package.json`. Se evitan las *dependencias fantasma*: código que funciona en local porque una librería está instalada por otro paquete y falla al empaquetarse o desplegarse por separado.
- **Eficiencia.** Un almacén compartido y enlaces en lugar de copias reducen el tiempo de instalación y el espacio en disco.
- **Ejecución por paquete y en orden.** `--filter` y la ejecución recursiva respetan el grafo de dependencias del workspace sin configuración adicional.

**Sin orquestador por ahora:**

- Con cuatro paquetes, el orden de ejecución lo resuelve pnpm y los tiempos previstos de compilación y pruebas son de segundos.
- Un orquestador añade configuración, conceptos y dependencias cuyo beneficio aparece con más paquetes o con tiempos de CI elevados.
- Mantener la configuración estándar de Angular CLI y Nest CLI facilita la incorporación de personas familiarizadas con esas herramientas.

## Alternativas descartadas

**npm workspaces.** Viene incluido con Node.js y no requiere instalar nada más. Se descarta porque no aísla las dependencias de cada paquete y su filtrado y ejecución por paquete son más limitados.

**Turborepo.** Coordina los scripts existentes de cada paquete según su grafo de dependencias, los ejecuta en paralelo y guarda sus resultados en caché local o remota para no repetir trabajo. Se descarta por ahora porque su beneficio es marginal con cuatro paquetes. Es la opción preferente si el problema futuro es solo el tiempo de ejecución: al reutilizar la convención de scripts de esta decisión, su adopción requeriría poca configuración.

**Nx.** Aporta un grafo explícito del proyecto, la ejecución de tareas solo sobre lo afectado por un cambio (`nx affected`), caché local y remota, generadores de código y plugins específicos para Angular y NestJS. Además permite imponer reglas de dependencia entre proyectos. Es una opción habitual en organizaciones con este stack. Se descarta por ahora por tres motivos:

- Sustituye la configuración estándar de Angular CLI y Nest CLI por la suya propia (`project.json` y *executors*), lo que añade una capa que el equipo debe aprender y mantener.
- Sus ventajas se aprecian sobre todo en repositorios con muchos proyectos o equipos.
- Migrar más adelante es viable, porque Nx puede incorporarse de forma progresiva a un workspace de pnpm existente.

## Consecuencias

**Positivas:**

- Dependencias explícitas y verificables en cada paquete.
- Instalaciones rápidas y reproducibles gracias al lockfile y a la versión fijada de pnpm.
- Configuración mínima y estándar, alineada con la documentación oficial de cada framework.
- Camino de adopción sencillo para un orquestador gracias a la convención de scripts.

**Costes y riesgos:**

- Cada persona necesita pnpm, instalado directamente o mediante Corepack.
- Sin caché de tareas, la CI ejecuta todas las comprobaciones en cada pull request.
- Algunas herramientas esperan la estructura plana de `node_modules` de npm. En particular, los proyectos nativos de Capacitor pueden requerir ajustar la resolución de dependencias del visor. Se validará en la prueba de concepto del visor multiplataforma (LF-12).

## Criterios de revisión

Esta decisión se revisará mediante un nuevo ADR si se cumple alguna de estas condiciones:

- La CI de una pull request supera los **10 minutos** de forma sostenida.
- El monorepo supera **seis paquetes** o aparecen librerías compartidas con dependencias entre ellas.
- Se necesitan **generadores compartidos** o **reglas de dependencia entre proyectos** para mantener la consistencia de la arquitectura.

En ese caso, la preferencia será **Turborepo** si el problema es solo el tiempo de ejecución, y **Nx** si además se necesitan generadores o reglas de dependencia.

## Referencias

- [Workspaces de pnpm](https://pnpm.io/workspaces)
- [Filtrado en pnpm](https://pnpm.io/filtering)
- [Documentación de Turborepo](https://turborepo.com/docs)
- [Documentación de Nx](https://nx.dev/docs)
- [Calendario de versiones de Node.js](https://nodejs.org/en/about/previous-releases)
