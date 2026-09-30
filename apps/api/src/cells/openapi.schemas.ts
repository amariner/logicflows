import {
  stateMessageSchema,
  statusMessageSchema,
  telemetryMessageSchema,
} from '@logicflows/contract';
import type { ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';

/** Esquema OpenAPI de @nestjs/swagger, que no exporta su tipo. */
type SchemaObject = NonNullable<
  Extract<NonNullable<Parameters<typeof ApiOkResponse>[0]>, { schema?: unknown }>['schema']
>;

/** Esquema OpenAPI 3.0 generado a partir del contrato: la documentación no puede divergir. */
const fromContract = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' }) as SchemaObject;

const nullable = (schema: SchemaObject): SchemaObject => ({ ...schema, nullable: true });

const identifier = (description: string): SchemaObject => ({
  type: 'string',
  pattern: '^[a-z0-9-]{1,32}$',
  description,
});

export const cellSnapshotSchema: SchemaObject = {
  type: 'object',
  description:
    'Última información conocida de una célula. Cada mensaje es null si todavía no se ha recibido.',
  required: ['siteId', 'cellId', 'status', 'state', 'telemetry'],
  properties: {
    siteId: identifier('Planta'),
    cellId: identifier('Célula'),
    status: nullable(fromContract(statusMessageSchema)),
    state: nullable(fromContract(stateMessageSchema)),
    telemetry: nullable(fromContract(telemetryMessageSchema)),
  },
};

export const productionSchema: SchemaObject = {
  type: 'object',
  required: ['siteId', 'cellId', 'from', 'to', 'boxes', 'pallets'],
  properties: {
    siteId: identifier('Planta'),
    cellId: identifier('Célula'),
    from: { type: 'string', format: 'date-time', description: 'Inicio del periodo (incluido)' },
    to: { type: 'string', format: 'date-time', description: 'Fin del periodo (excluido)' },
    boxes: { type: 'integer', minimum: 0, description: 'Cajas paletizadas en el periodo' },
    pallets: { type: 'integer', minimum: 0, description: 'Pallets completados en el periodo' },
  },
};

export const problemSchema: SchemaObject = {
  type: 'object',
  description: 'Error según RFC 9457 (Problem Details), con content-type application/problem+json.',
  required: ['type', 'title', 'status', 'detail', 'instance'],
  properties: {
    type: { type: 'string', example: 'about:blank' },
    title: { type: 'string', example: 'Petición no válida' },
    status: { type: 'integer', example: 400 },
    detail: { type: 'string' },
    instance: { type: 'string', example: '/api/v1/sites/demo/cells/cell-01/production' },
    errors: {
      type: 'array',
      description: 'Campos no válidos, en los errores de validación',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
};
