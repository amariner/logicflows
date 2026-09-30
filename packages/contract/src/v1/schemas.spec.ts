import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { messageSchemas } from './messages.ts';
import { MESSAGE_KINDS } from './topics.ts';

// Guardia de compatibilidad: el JSON Schema de cada mensaje se versiona en
// schemas/v1. Cualquier cambio en el contrato hace fallar esta prueba hasta
// que se regeneran los ficheros con `pnpm --filter @logicflows/contract
// test -u`, de modo que la revisión decide si el cambio es compatible.
describe('JSON Schema publicado', () => {
  it.each(MESSAGE_KINDS)('el esquema de %s coincide con el publicado', async (kind) => {
    const jsonSchema = z.toJSONSchema(messageSchemas[kind], { io: 'input' });
    await expect(`${JSON.stringify(jsonSchema, null, 2)}\n`).toMatchFileSnapshot(
      `../../schemas/v1/${kind}.schema.json`,
    );
  });
});
