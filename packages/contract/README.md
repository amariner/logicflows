# @logicflows/contract

Contrato de telemetría de LogicFlows: topics MQTT, tipos y validación de los mensajes que publican las células y consumen la API y el visor. Implementa [ADR-0004](../../docs/adr/0004-mensajes-de-telemetria-y-topics-mqtt.md) y los estados de [ADR-0003](../../docs/adr/0003-estados-de-la-paletizadora.md). La forma de compartirlo se decide en [ADR-0005](../../docs/adr/0005-paquete-del-contrato.md).

## Uso

```ts
import { buildTopic, decodeMessage, isExpectedTransition } from '@logicflows/contract';

// Publicador
const topic = buildTopic({ siteId: 'demo', cellId: 'cell-01', kind: 'state' });

// Consumidor: nunca lanza excepciones
const result = decodeMessage(topic, payload.toString());
if (!result.ok) {
  logger.warn({ reason: result.reason, detail: result.detail }, 'Mensaje descartado');
} else if (result.kind === 'state') {
  result.message.state; // CellState, con tipos inferidos del esquema
}
```

| Exportación | Contenido |
|---|---|
| `buildTopic`, `parseTopic`, `subscriptionFilter` | Construcción e interpretación de topics `logicflows/v1/{siteId}/{cellId}/{kind}` |
| `statusMessageSchema`, `stateMessageSchema`, `telemetryMessageSchema` | Esquemas Zod de cada mensaje y sus tipos (`StatusMessage`, `StateMessage`, `TelemetryMessage`) |
| `decodeMessage` | Validación completa de un mensaje recibido: topic, JSON, esquema y coherencia con el topic |
| `CELL_STATES`, `TRANSITIONS`, `isExpectedTransition`, `targetStates` | Estados y transiciones previstas de ADR-0003 |
| `CURRENT_SCHEMA_VERSION` | Versión del esquema que emiten los publicadores |
| `REALTIME_PATH`, `RealtimeMessage`, `CellSnapshot` | Mensajes del WebSocket entre la API y el visor ([ADR-0006](../../docs/adr/0006-canal-de-tiempo-real.md)) |
| `@logicflows/contract/testing` | Constructores de mensajes válidos para pruebas |

El JSON Schema de cada mensaje está en [`schemas/v1`](schemas/v1) para consumidores escritos en otros lenguajes.

## Consumirlo desde otro paquete

1. Declarar la dependencia: `"@logicflows/contract": "workspace:*"`.
2. Para que TypeScript y Vitest lean el código fuente sin compilar el contrato, añadir la condición de exportación `@logicflows/source`:
   - `tsconfig.json`: `"customConditions": ["@logicflows/source"]`.
   - Configuración de Vitest para pruebas en Node.js: `ssr.resolve.conditions`, conservando las condiciones predeterminadas de Vite:

     ```ts
     ssr: { resolve: { conditions: ['@logicflows/source', 'module', 'node', 'development|production'] } }
     ```
3. En ejecución se usa la versión compilada de `dist`. `pnpm build` compila el contrato antes que sus consumidores. En desarrollo, Node.js también puede ejecutar el código fuente directamente con `node --conditions=@logicflows/source`.

El código del contrato no depende de Node.js para poder usarse también en el navegador. Las importaciones relativas usan la extensión `.ts` y solo sintaxis que Node.js puede ejecutar sin compilar (`erasableSyntaxOnly`); `tsc` las reescribe a `.js` al compilar.

## Cambios en el contrato

- Las pruebas validan los ejemplos JSON de ADR-0004: el ADR y el código no pueden divergir.
- `src/v1/schemas.spec.ts` compara el JSON Schema de cada mensaje con el publicado en `schemas/v1`. Cualquier cambio hace fallar la prueba hasta regenerarlo con:

  ```sh
  pnpm --filter @logicflows/contract test -u
  ```

  La revisión de la pull request decide si el cambio es compatible (se incrementa `CURRENT_SCHEMA_VERSION`) o incompatible (nueva versión mayor en `src/v2` y topics `logicflows/v2`).

## Scripts

| Script | Qué hace |
|---|---|
| `build` | Compila a `dist` (ESM y declaraciones de tipos) |
| `typecheck` | Comprueba los tipos, incluidas las pruebas |
| `lint` | ESLint |
| `test` | Pruebas unitarias con cobertura |
