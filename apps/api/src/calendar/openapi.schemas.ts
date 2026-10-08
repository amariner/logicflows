import type { ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';

import { exceptionBodySchema, versionBodySchema } from './calendar.schemas.ts';

/** Esquema OpenAPI de @nestjs/swagger, que no exporta su tipo. */
type SchemaObject = NonNullable<
  Extract<NonNullable<Parameters<typeof ApiOkResponse>[0]>, { schema?: unknown }>['schema']
>;

/** Los cuerpos se documentan a partir de su validación: no pueden divergir. */
const fromInput = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

const date = (description: string): SchemaObject => ({
  type: 'string',
  format: 'date',
  description,
});

export const versionBodyOpenApi = fromInput(versionBodySchema);
export const exceptionBodyOpenApi = fromInput(exceptionBodySchema);

const shiftSchema: SchemaObject = {
  type: 'object',
  required: ['weekday', 'start', 'end', 'name'],
  properties: {
    weekday: { type: 'integer', minimum: 1, maximum: 7, description: '1 es lunes y 7 es domingo' },
    start: { type: 'integer', minimum: 0, maximum: 23, description: 'Hora en punto de inicio' },
    end: {
      type: 'integer',
      minimum: 0,
      maximum: 23,
      description: 'Hora en punto de fin; si es menor o igual que start, el día siguiente',
    },
    name: { type: 'string', example: 'Mañana' },
  },
};

export const versionSchema: SchemaObject = {
  type: 'object',
  required: ['effectiveFrom', 'timeZone', 'shifts', 'createdBy', 'createdAt'],
  properties: {
    effectiveFrom: date('Fecha local de entrada en vigor'),
    timeZone: { type: 'string', example: 'Europe/Madrid' },
    shifts: { type: 'array', items: shiftSchema },
    createdBy: { type: 'string', description: 'Nombre de usuario de quien la creó' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const exceptionSchema: SchemaObject = {
  type: 'object',
  required: ['date', 'name', 'createdBy', 'createdAt'],
  properties: {
    date: date('Fecha local sin turnos'),
    name: { type: 'string', example: 'Festivo' },
    createdBy: { type: 'string', description: 'Nombre de usuario de quien la creó' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const calendarSchema: SchemaObject = {
  type: 'object',
  required: ['siteId', 'today', 'current', 'versions', 'exceptions'],
  properties: {
    siteId: { type: 'string', example: 'demo' },
    today: date('Hoy en la planta, en la zona horaria de su última versión'),
    current: { ...date('Entrada en vigor de la versión vigente hoy'), nullable: true },
    versions: { type: 'array', items: versionSchema },
    exceptions: { type: 'array', items: exceptionSchema },
  },
};
