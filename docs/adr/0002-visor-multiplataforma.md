# ADR-0002: Visor multiplataforma

- **Estado:** Aceptado
- **Fecha:** 2026-09-30
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-12

## Contexto

El visor muestra en tiempo real el estado y la producción de las células de paletizado. Tiene dos tipos de uso:

- **Escritorio:** supervisión desde la oficina de producción o una sala de control, con pantallas grandes y varias células a la vista.
- **Móvil y tableta:** consulta a pie de máquina por parte de operarios, técnicos de mantenimiento y responsables de turno.

La hoja de ruta prevé tres formas de entrega: aplicación web (Hito 1), aplicación instalable como PWA (Hito 2) y aplicación Android (Hito 3). El equipo cuenta con un único perfil de frontend, por lo que mantener dos bases de código para el mismo visor no es sostenible.

Restricciones:

- El monorepo usa pnpm con el enlazador aislado por defecto ([ADR-0001](0001-gestor-de-paquetes-y-orquestacion.md)). Algunas herramientas nativas esperan la estructura plana de `node_modules` de npm, y eso debía comprobarse antes de decidir.
- El visor es una aplicación privada para usuarios autenticados, sin necesidad de posicionamiento en buscadores.

## Opciones consideradas

1. **Ionic, Angular y Capacitor:** un único código web con componentes adaptados a pantallas táctiles, empaquetado como aplicación nativa mediante Capacitor.
2. **Angular con Angular Material y Capacitor, sin Ionic:** la misma envoltura nativa con una librería de componentes orientada a escritorio.
3. **Angular como aplicación web y PWA, sin envoltura nativa:** Android se cubriría instalando la PWA o mediante una Trusted Web Activity.
4. **Aplicación web más una aplicación móvil independiente** (Kotlin nativo, React Native o Flutter).

## Decisión

1. El visor se construye con **Ionic 9, Angular 22 y Capacitor 8** en una única base de código, dentro del paquete `apps/dashboard` del monorepo.
2. Se parte de la plantilla oficial de Ionic para Angular con **componentes standalone**. La plantilla ya genera una aplicación sin zone.js, con Vitest para las pruebas unitarias y ESLint.
3. **Plataformas objetivo:** web en el Hito 1, PWA en el Hito 2 y Android en el Hito 3. iOS queda fuera del alcance hasta que exista una necesidad concreta.
4. Se usa el **modo visual `md`** de Ionic en todas las plataformas. El visor tiene el mismo aspecto en escritorio, Android y cualquier otro dispositivo, lo que simplifica el diseño, las pruebas visuales y las de accesibilidad.
5. **Diseño adaptable desde el principio:** en escritorio el visor usa un menú lateral fijo (`ion-split-pane`) y una rejilla de paneles que aprovecha el ancho disponible. En móvil el menú se oculta y los paneles se apilan.
6. **Sin renderizado en servidor (SSR).** El visor se compila como aplicación estática de cliente.
7. Se mantiene el **enlazador aislado de pnpm**. Capacitor no necesita `node-linker=hoisted` ni `shamefullyHoist`.
8. El proyecto Android, cuando se añada en el Hito 3, se versiona en el repositorio. Después de cada instalación de dependencias se ejecuta `cap sync`, tanto en local como en la CI, antes de compilar con Gradle.

## Justificación

**Un solo código para todas las plataformas.** Con un perfil de frontend, cada funcionalidad se implementa, prueba y revisa una vez. Las opciones 1 y 2 cumplen este requisito; la 4 lo incumple.

**Ionic frente a Angular Material.** El uso a pie de máquina es el más exigente: pantallas pequeñas, uso con guantes o con una mano, gestos y áreas seguras de los dispositivos. Ionic resuelve de serie la navegación con historial de pantallas, los gestos, las áreas seguras y el tamaño táctil de los controles. Angular Material está orientado a escritorio y obligaría a desarrollar esas piezas. La desventaja de Ionic en escritorio se mitiga con `ion-split-pane` y una rejilla adaptable.

**Capacitor frente a PWA sola.** La PWA cubre gran parte de las necesidades y se entregará en el Hito 2. Capacitor añade, sin cambiar el código del visor, acceso a notificaciones nativas, vibración y almacenamiento seguro, y la posibilidad de distribuir la aplicación mediante tiendas o gestión de dispositivos (MDM), que es la forma habitual de desplegar aplicaciones en plantas industriales.

**Sin SSR.** El SSR mejora el posicionamiento en buscadores y el tiempo de la primera visualización de páginas públicas. El visor no tiene páginas públicas, sus datos cambian en tiempo real por WebSocket y el paquete Android debe contener una compilación estática. El SSR añadiría un servidor Node.js que desplegar y dos variantes de compilación sin beneficio para los usuarios. Si se necesitara más adelante, Ionic mantiene `@ionic/angular-server` para Angular Universal.

## Prueba de concepto

Se validó la integración en la rama [`spike/LF-12-capacitor-pnpm`](https://github.com/amariner/logicflows/tree/spike/LF-12-capacitor-pnpm), que no se fusiona en `main`. Contiene un workspace de pnpm con la forma prevista del monorepo y la plantilla `blank` de Ionic para Angular en `apps/dashboard`, con Capacitor y la plataforma Android.

Resultados:

| Comprobación | Resultado |
|---|---|
| `pnpm install` con el enlazador aislado | Correcta, tras revisar los scripts de instalación (ver más abajo) |
| Pruebas unitarias (Vitest) y lint (ESLint) de la plantilla | Correctos |
| Build web (`ng build`) | Correcta en unos 6 segundos |
| `cap add android` y `cap sync` | Correctos: los cuatro plugins nativos se detectan |
| Rutas a los plugins en `capacitor.settings.gradle` | Apuntan al almacén de pnpm (`node_modules/.pnpm/...`) y existen |
| Reproducibilidad de `cap sync` en la CI | La CI genera las mismas rutas que las versionadas |
| APK de depuración con Gradle (JDK 21, Android SDK API 36) | Correcto: `assembleDebug` en 1 min 52 s |

La validación completa se ejecutó en GitHub Actions ([ejecución](https://github.com/amariner/logicflows/actions/runs/36780614622)) sobre Ubuntu 24.04 con Node.js 24.21, pnpm 11.10 y JDK 21, y tardó 2 min 35 s sin caché.

### Hallazgos

1. **Rutas versionadas en Gradle.** `cap sync` resuelve los enlaces simbólicos de pnpm y escribe en `android/capacitor.settings.gradle` rutas reales que incluyen la versión de cada plugin, por ejemplo `node_modules/.pnpm/@capacitor+app@8.1.1_@capacitor+core@8.5.2/...`. El fichero cambia en cada actualización de un plugin y debe regenerarse con `cap sync` después de instalar dependencias. Por eso la CI ejecuta `cap sync` antes de Gradle y comprueba que no hay diferencias con lo versionado.
2. **Node.js mínimo.** Angular 22 exige Node.js 24.15 o posterior. La referencia a «Node.js 24 LTS» de ADR-0001 debe concretarse con una versión mínima. pnpm puede descargar y fijar la versión exacta del proyecto mediante `devEngines.runtime` en el `package.json` de la raíz, de modo que todo el equipo y la CI usan la misma sin gestores de versiones adicionales. Se adopta en LF-14 como complemento a `.nvmrc`.
3. **Scripts de instalación de las dependencias.** pnpm 11 bloquea por defecto los scripts de instalación de las dependencias y la instalación falla si alguno no se ha revisado (`strictDepBuilds`). La plantilla incluye cuatro paquetes con scripts: `esbuild`, `@parcel/watcher`, `lmdb` y `msgpackr-extract`. Todos distribuyen binarios precompilados, así que se deniegan sus scripts en `allowBuilds` y la compilación funciona igual. Cada nueva dependencia con scripts de instalación requerirá una decisión explícita en la revisión.

## Alternativas descartadas

**Angular con Angular Material y Capacitor.** Ofrece mejores componentes para escritorio, como tablas de datos, y se integra con Capacitor igual que Ionic. Se descarta porque el uso móvil a pie de máquina requeriría construir la navegación, los gestos y la adaptación táctil. Sería la opción preferente si el visor pasara a usarse casi exclusivamente en escritorio.

**Angular como web y PWA, sin envoltura nativa.** Es la opción más sencilla y la PWA forma parte del plan. Se descarta como única entrega porque no permite distribuir la aplicación mediante MDM ni acceder a todas las capacidades nativas. Añadir Capacitor más adelante sería posible, pero Ionic facilita desde el principio un diseño preparado para móvil.

**Aplicación web más una aplicación móvil independiente.** Da la mejor experiencia nativa, pero duplica el desarrollo, las pruebas y el contrato con la API en dos tecnologías distintas. No es asumible para un equipo con un perfil de frontend.

## Consecuencias

**Positivas:**

- Una sola base de código para web, PWA y Android.
- Componentes táctiles, accesibles y adaptables sin desarrollo propio.
- El monorepo mantiene el enlazador aislado de pnpm y sus garantías frente a dependencias fantasma.
- Plantilla actualizada: componentes standalone, sin zone.js, Vitest y ESLint.

**Costes y riesgos:**

- Ionic no incluye tablas de datos ni gráficos. Se elegirán librerías específicas cuando se necesiten, previsiblemente en el Hito 4.
- La apariencia en escritorio es la de una aplicación móvil ampliada si no se cuida el diseño adaptable. Se mitiga con la decisión 5 y con la revisión de diseño de cada vista.
- Las rutas versionadas de `capacitor.settings.gradle` generan cambios en ese fichero con cada actualización de plugins.
- Compilar Android exige JDK 21 y el Android SDK. Solo es necesario a partir del Hito 3 y la CI los proporciona.
- El equipo depende del ritmo de publicación de Ionic y Capacitor para adoptar nuevas versiones de Angular.

## Criterios de revisión

Esta decisión se revisará mediante un nuevo ADR si se cumple alguna de estas condiciones:

- El uso del visor pasa a ser mayoritariamente de escritorio y la adaptación de Ionic resulta costosa.
- Se necesita iOS o una capacidad nativa que Capacitor no cubre.
- Ionic o Capacitor dejan de publicar versiones compatibles con la versión de Angular soportada.
- Aparece un requisito de páginas públicas o de posicionamiento en buscadores que justifique el SSR.

## Referencias

- [Documentación de Ionic para Angular](https://ionicframework.com/docs/angular/overview)
- [Documentación de Capacitor](https://capacitorjs.com/docs)
- [Requisitos del entorno de Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Configuración de compilación de pnpm](https://pnpm.io/settings/build)
- [Versiones soportadas de Angular](https://angular.dev/reference/versions)
