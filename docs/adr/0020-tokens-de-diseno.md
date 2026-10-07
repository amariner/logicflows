# ADR-0020: Tokens de diseño compartidos en código

- **Estado:** Aceptado
- **Fecha:** 2026-10-07
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-102

## Contexto

El Hito 5 rediseña el visor web, la app Android y la página de inicio de sesión. La dirección visual se eligió a partir de una exploración con Stitch ([exploración](../diseno/exploracion-stitch.md)): paleta sobria en claro y oscuro, Inter para textos y JetBrains Mono para cifras.

Las mismas decisiones de diseño (colores, tipografía, espaciado y radios) las necesitan dos consumidores con tecnologías distintas:

| Consumidor | Tecnología | Cómo se tematiza |
|---|---|---|
| Visor (web, PWA y Android con Capacitor) | Angular, Ionic 9, SCSS | Variables CSS de Ionic (`--ion-…`) y propias (`--lf-…`, hoy en `apps/dashboard/src/theme/variables.scss`) |
| Inicio de sesión | Tema de Keycloak 26 en la imagen `logicflows-identity` | CSS propio del tema |

Condiciones que pesan:

- **Figma no puede ser la fuente automática.** El equipo usa el plan gratuito (Starter): la lectura automatizada de ficheros está muy limitada, cada colección de variables admite un solo modo (no hay claro y oscuro en la misma colección) y la API de variables de Figma exige el plan Enterprise.
- **La app Android funciona sin conexión** al arrancar, y la política de seguridad de contenido (CSP) del visor solo permite recursos propios (LF-52).
- **Hay un solo producto y un solo equipo.** No hay diseñadores dedicados que mantengan Figma día a día.

## Opciones consideradas

1. **Un `tokens.css` compartido, escrito a mano:** un paquete del monorepo con las variables CSS semánticas en claro y oscuro, usado por el visor y por el tema de Keycloak.
2. **JSON de tokens con generador:** `tokens.json` en formato del W3C Design Tokens Community Group, transformado por Style Dictionary en CSS. Figma se sincronizaría con el plugin Tokens Studio.
3. **Ampliar `variables.scss` del visor:** seguir como hoy, con más variables.

Para las fuentes:

- **a.** Incluidas en la aplicación (`@fontsource/inter`, `@fontsource/jetbrains-mono`).
- **b.** Servidas por Google Fonts.

## Decisión

**Opción 1 con fuentes incluidas (a).**

1. **Paquete `@logicflows/design-tokens`** en `packages/design-tokens`, con un único `tokens.css`:
   - **Variables semánticas** con el prefijo `--lf-`, nombradas por su papel y no por su valor: `--lf-color-text`, `--lf-color-text-muted`, `--lf-color-surface-1`, `--lf-color-primary`, `--lf-color-state-fault`, `--lf-color-alarm-high`, `--lf-space-4`, `--lf-radius-2`, `--lf-font-sans`, `--lf-font-mono`…
   - **Claro por defecto y oscuro** con `prefers-color-scheme: dark` y con la clase `.lf-dark`, para que el usuario pueda elegir el tema.
   - **Sin dependencias de Ionic ni de Angular.** El paquete solo contiene CSS.
2. **El visor mapea los tokens a Ionic** en `apps/dashboard/src/theme/variables.scss` (`--ion-background-color: var(--lf-color-surface-0)`…). Los componentes usan los tokens `--lf-…`, nunca valores sueltos.
3. **El tema de Keycloak copia `tokens.css`** al construir la imagen `logicflows-identity`, en la misma etapa del `Dockerfile` que hoy prepara el realm.
4. **Fuentes incluidas** con `@fontsource`: solo los pesos que se usan (Inter 400, 500 y 600; JetBrains Mono 400 y 600) y en formato `woff2`.
5. **El contraste se comprueba en la CI:** una prueba del paquete calcula el contraste de cada par texto/fondo declarado y falla por debajo de 4,5:1 (3:1 para elementos gráficos y texto grande).
6. **Figma guarda la exploración y las pantallas finales.** No es la fuente de verdad de los valores: si se cambia un token, se actualiza en el código y, si hace falta para el dosier, se refleja después en Figma.

## Justificación

- **Una sola fuente para los dos consumidores.** El visor y Keycloak comparten el mismo fichero, así que el inicio de sesión y la aplicación no pueden separarse.
- **Sin herramientas nuevas.** Un fichero CSS se revisa en una pull request como cualquier otro cambio, y las variables CSS ya permiten el cambio de tema en tiempo de ejecución, sin recompilar.
- **Los nombres semánticos permiten crecer.** Si llegan un diseñador que trabaje en Figma o varios productos, se pasa a la opción 2 generando el mismo `tokens.css` desde un JSON, sin tocar los consumidores.
- **Fuentes incluidas:** la app funciona sin conexión, la CSP no se abre a un dominio externo, no se envían las IP de los usuarios a terceros y la licencia de las dos fuentes (SIL Open Font License) lo permite.

## Alternativas descartadas

- **JSON con generador (opción 2).** Es el estándar en sistemas de diseño grandes y permite sincronizar con Figma. Hoy añade una herramienta y un paso de build para un solo producto, y la sincronización con Figma tampoco sería automática en el plan gratuito. Se reconsiderará con los criterios de revisión.
- **Ampliar `variables.scss` (opción 3).** Lo mínimo, pero el tema de Keycloak no lo podría reutilizar, y los tokens quedarían mezclados con la configuración de Ionic.
- **Google Fonts (b).** Evita alojar las fuentes, pero no funciona sin conexión en Android, obliga a ampliar la CSP y envía datos de los usuarios a un tercero.

## Consecuencias

- **Figma y el código pueden separarse.** Nada los sincroniza: las capturas de referencia de la CI (LF-110) detectan cambios visuales no deseados en el código, pero no diferencias con Figma.
- **El visor pesa algo más:** los cinco ficheros `woff2` del alfabeto latino suman entre 150 y 200 kB, que se descargan una vez y quedan en caché. Se medirá en LF-105 junto al tiempo hasta ver datos en red móvil (LF-59).
- **El tema oscuro elegido a mano** necesita guardar la preferencia en el dispositivo. Si no hay preferencia, se sigue al sistema.

## Criterios de revisión

- Un diseñador que trabaje en Figma, o un plan de Figma con variables por modos y acceso automatizado.
- Un segundo producto, o una app nativa que no pueda usar CSS.
- Más de unas 150 variables, o cambios frecuentes de tokens que hagan pesada la revisión a mano.
