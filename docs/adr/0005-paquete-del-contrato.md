# ADR-0005: Paquete compartido del contrato de telemetría

- **Estado:** Aceptado
- **Fecha:** 2026-10-01
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-21

## Contexto

[ADR-0004](0004-mensajes-de-telemetria-y-topics-mqtt.md) define los mensajes MQTT. El simulador los publica, la API los valida y el visor muestra datos derivados de ellos. Si cada aplicación interpretara el contrato por su cuenta, las diferencias aparecerían en ejecución, con datos de planta, y no al compilar. [ADR-0001](0001-gestor-de-paquetes-y-orquestacion.md) dejó para esta tarea decidir cómo se comparte.

Requisitos:

- Una única fuente para los tipos de TypeScript y para la validación en tiempo de ejecución, que debe descartar los mensajes inválidos que lleguen del broker.
- Utilizable en Node.js (simulador y API) y en el navegador (visor).
- Tipos disponibles durante el desarrollo sin tener que compilar el paquete tras cada cambio.
- Un cambio incompatible del contrato no puede pasar desapercibido en la revisión.
- Consumidores futuros escritos en otros lenguajes, como un agente edge, deben poder validar los mismos mensajes.

## Opciones consideradas

**Definición y validación:**

1. **Zod 4:** esquemas en TypeScript de los que se infieren los tipos y se genera JSON Schema.
2. **JSON Schema con Ajv:** el esquema en JSON como fuente, con tipos generados a partir de él.
3. **TypeBox:** esquemas en TypeScript que son JSON Schema de forma nativa.
4. **Valibot:** esquemas en TypeScript con un diseño modular que reduce el tamaño en el navegador.
5. **class-validator:** clases con decoradores, habitual en NestJS.

**Distribución dentro del monorepo:**

1. Paquete **compilado** a JavaScript, consumido desde `dist`.
2. Paquete **sin compilar**: cada consumidor compila el código fuente TypeScript.
3. Paquete compilado con **tipos en vivo**: TypeScript y Vitest leen el código fuente mediante una condición de exportación propia, y la ejecución usa `dist`.

## Decisión

1. El contrato es el paquete **`@logicflows/contract`** en `packages/contract`. El workspace distingue las aplicaciones desplegables (`apps/*`) de las librerías compartidas (`packages/*`).
2. Los mensajes se definen con **Zod 4**. Los tipos se infieren de los esquemas (`z.infer`), así que no pueden divergir de la validación.
3. El paquete se compila a **ESM con declaraciones de tipos** en `dist`. Sus exportaciones incluyen la condición **`@logicflows/source`**, que apunta al código fuente: los consumidores la activan en TypeScript (`customConditions`) y en Vitest (`resolve.conditions`). En ejecución se usa `dist`, que `pnpm build` genera antes que los consumidores por el orden topológico del workspace.
4. Contenido del paquete:
   - Topics: construcción, interpretación y filtros de suscripción.
   - Esquemas y tipos de `status`, `state` y `telemetry`.
   - `decodeMessage`: valida topic, JSON, esquema y coherencia entre mensaje y topic, y devuelve un resultado con el motivo del rechazo. Nunca lanza excepciones.
   - Estados y tabla de transiciones de [ADR-0003](0003-estados-de-la-paletizadora.md).
   - Constructores de mensajes válidos para pruebas en `@logicflows/contract/testing`.
5. El código del paquete **no depende de Node.js**. Una regla de ESLint lo impide fuera de las pruebas.
6. **Compatibilidad y versiones:**
   - El código de cada versión mayor vive en su propio directorio (`src/v1`).
   - Los esquemas aceptan campos desconocidos y cualquier `schemaVersion` mayor o igual que 1, según la política de consumidor tolerante de ADR-0004. Los publicadores emiten `CURRENT_SCHEMA_VERSION`.
   - El JSON Schema de cada mensaje se genera desde Zod y se versiona en `schemas/v1`. Una prueba compara el esquema actual con el publicado: cualquier cambio del contrato la hace fallar hasta regenerarlo, y la revisión decide si es compatible o exige `v2`.
   - Otra prueba valida los ejemplos JSON de ADR-0004, de modo que el ADR y el código no pueden divergir.

## Justificación

**Zod frente a JSON Schema con Ajv.** Escribir JSON Schema a mano es verboso y los tipos generados dependen de un paso adicional. Con Zod el esquema es código TypeScript, los tipos se infieren sin generación y se obtiene igualmente JSON Schema para otros lenguajes. Zod es además la librería de validación más extendida en el ecosistema TypeScript, lo que facilita la incorporación de personas al equipo.

**Zod frente a TypeBox y Valibot.** TypeBox es más rápido al validar, pero su modelo expresa peor las reglas entre campos, como que la causa de espera solo exista en `WAITING`. Valibot reduce el tamaño en el navegador, pero el visor necesita sobre todo los tipos, que desaparecen al compilar, y su ecosistema es menor. Con unos pocos mensajes por segundo y célula, el rendimiento de validación de Zod es suficiente.

**Zod frente a class-validator.** class-validator es natural en NestJS, pero obliga a definir clases con decoradores, separa los tipos de la validación y no encaja en el visor ni en el simulador.

**Tipos en vivo.** Compilar el contrato antes de cada comprobación de tipos ralentiza el desarrollo y produce errores confusos cuando `dist` está desactualizado. Un paquete sin compilar obligaría a que Angular, NestJS y Node.js compilaran TypeScript desde otro paquete, cada uno con su configuración. La condición de exportación da lo mejor de ambos: el editor, `tsc` y Vitest ven siempre el código actual, y en ejecución se usa el JavaScript compilado.

## Alternativas descartadas

**JSON Schema con Ajv.** Es la opción natural si el contrato pasa a ser propiedad de un equipo que no trabaja en TypeScript. El JSON Schema publicado permite dar ese paso sin reescribir.

**TypeBox.** Preferible si la validación llega a ser un cuello de botella.

**Valibot.** Preferible si el visor necesitara validar mensajes en el navegador y el tamaño del bundle fuera crítico.

**class-validator.** Descartado por no servir fuera de NestJS.

**Paquete sin compilar.** Descartado por acoplar el contrato a la configuración de compilación de cada consumidor.

## Consecuencias

**Positivas:**

- Un solo lugar define los mensajes; un cambio incompatible falla al compilar en los consumidores o en la guardia de JSON Schema.
- `decodeMessage` concentra en una función pura, probada unitariamente, la primera línea de defensa de la ingesta.
- La tabla de transiciones de ADR-0003 es código compartido: el simulador la cumple y la API la usa para detectar transiciones no previstas.
- JSON Schema disponible para consumidores en otros lenguajes.

**Costes y riesgos:**

- Cada consumidor debe configurar la condición `@logicflows/source` en TypeScript y Vitest.
- Antes de ejecutar una aplicación hay que compilar el contrato. `pnpm build` lo hace en orden; los comandos de desarrollo de cada aplicación deben hacerlo también.
- Zod añade unos kilobytes al bundle del visor si este valida datos en tiempo de ejecución.
- La guardia de JSON Schema exige regenerar los ficheros en cada cambio del contrato, también en los compatibles. Es intencionado: obliga a revisarlos.

## Criterios de revisión

- El contrato pasa a mantenerse fuera del monorepo o lo consumen equipos que no usan TypeScript.
- La validación de mensajes aparece como cuello de botella en la API.
- El visor necesita validar mensajes en el navegador y el tamaño de Zod resulta relevante.

## Referencias

- [Zod](https://zod.dev/)
- [Conversión de Zod a JSON Schema](https://zod.dev/json-schema)
- [Condiciones de exportación de Node.js](https://nodejs.org/api/packages.html#conditional-exports)
- [Opción `customConditions` de TypeScript](https://www.typescriptlang.org/tsconfig/#customConditions)
