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

const ratio = (description: string): SchemaObject => ({
  type: 'number',
  minimum: 0,
  nullable: true,
  description,
});
const seconds = (description: string): SchemaObject => ({
  type: 'integer',
  minimum: 0,
  description,
});

const indicatorsSchema: SchemaObject = {
  type: 'object',
  description: 'Indicadores de planta de un periodo (docs/indicadores-de-planta.md).',
  required: [
    'from',
    'to',
    'boxes',
    'pallets',
    'seconds',
    'availability',
    'performance',
    'stops',
    'alarms',
  ],
  properties: {
    from: { type: 'string', format: 'date-time', description: 'Inicio (incluido)' },
    to: { type: 'string', format: 'date-time', description: 'Fin (excluido)' },
    boxes: { type: 'integer', minimum: 0, description: 'Cajas paletizadas' },
    pallets: { type: 'integer', minimum: 0, description: 'Pallets completados' },
    seconds: {
      type: 'object',
      required: ['total', 'noData', 'outOfProduction', 'planned', 'running', 'stopped'],
      properties: {
        total: seconds('Tiempo transcurrido del periodo; lo que aún no ha ocurrido no cuenta'),
        noData: seconds('Célula desconectada o sin datos'),
        outOfProduction: seconds('STOPPED: no se pretendía producir'),
        planned: seconds('Total − sin datos − fuera de producción'),
        running: seconds('En producción (RUNNING)'),
        stopped: seconds('Paradas: STARTING, PAUSED, WAITING, FAULT y EMERGENCY_STOP'),
      },
    },
    availability: ratio('En producción ÷ planificado; null sin tiempo planificado'),
    performance: ratio('Cajas ÷ (en producción × ritmo nominal); null sin tiempo en producción'),
    stops: {
      type: 'array',
      description: 'Paradas por causa, de mayor a menor duración',
      items: {
        type: 'object',
        required: ['cause', 'alarmCode', 'seconds', 'count'],
        properties: {
          cause: {
            type: 'string',
            enum: ['STARTING', 'PAUSED', 'STARVED', 'BLOCKED', 'FAULT', 'EMERGENCY_STOP'],
          },
          alarmCode: {
            type: 'string',
            nullable: true,
            description: 'Alarma que provocó el fallo; solo en FAULT',
            example: 'ROB-001',
          },
          seconds: seconds('Duración total'),
          count: { type: 'integer', minimum: 0, description: 'Veces que empezó en el periodo' },
        },
      },
    },
    alarms: {
      type: 'object',
      description: 'Alarmas activadas en el periodo, por gravedad',
      required: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      properties: Object.fromEntries(
        ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((severity) => [
          severity,
          { type: 'integer', minimum: 0 },
        ]),
      ),
    },
  },
};

export const historySchema: SchemaObject = {
  type: 'object',
  required: [
    'siteId',
    'cellId',
    'from',
    'to',
    'resolution',
    'timeZone',
    'nominalBoxesPerHour',
    'summary',
    'periods',
  ],
  properties: {
    siteId: identifier('Planta'),
    cellId: identifier('Célula'),
    from: { type: 'string', format: 'date-time', description: 'Inicio del periodo (incluido)' },
    to: { type: 'string', format: 'date-time', description: 'Fin del periodo (excluido)' },
    resolution: { type: 'string', enum: ['hour', 'day'] },
    timeZone: { type: 'string', example: 'Europe/Madrid' },
    nominalBoxesPerHour: {
      type: 'number',
      description: 'Ritmo nominal de la célula, base del rendimiento',
      example: 900,
    },
    summary: indicatorsSchema,
    periods: {
      type: 'array',
      description: 'Indicadores de cada hora o de cada día, en orden',
      items: indicatorsSchema,
    },
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
