import { Controller, Get, NotFoundException, Param, Query, applyDecorators } from '@nestjs/common';
import type { CellSnapshot } from '@logicflows/contract';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import { HistoryService } from '../history/history.service.ts';
import type { CellEventView } from '../history/events.ts';
import type { CellComparison } from '../history/history.service.ts';
import type { Indicators } from '../history/indicators.ts';
import { CellStateStore } from '../realtime/cell-state.store.ts';
import {
  cellParamsSchema,
  eventsQuerySchema,
  siteParamsSchema,
  historyQuerySchema,
  MAX_EVENTS,
  MAX_HISTORY_DAYS,
  MAX_RANGE_DAYS,
  productionQuerySchema,
} from './cells.schemas.ts';
import type {
  CellParams,
  EventsQuery,
  HistoryQuery,
  ProductionQuery,
  SiteParams,
} from './cells.schemas.ts';
import {
  cellSnapshotSchema,
  comparisonSchema,
  eventsSchema,
  historySchema,
  problemSchema,
  productionSchema,
} from './openapi.schemas.ts';

export interface ProductionResponse {
  readonly siteId: string;
  readonly cellId: string;
  readonly from: string;
  readonly to: string;
  readonly boxes: number;
  readonly pallets: number;
}

export interface HistoryResponse {
  readonly siteId: string;
  readonly cellId: string;
  readonly from: string;
  readonly to: string;
  readonly resolution: 'hour' | 'day';
  readonly timeZone: string;
  readonly nominalBoxesPerHour: number;
  readonly summary: Indicators;
  readonly periods: readonly Indicators[];
}

export interface ComparisonResponse {
  readonly siteId: string;
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  /** Una entrada por célula, ordenadas por su identificador. */
  readonly cells: readonly CellComparison[];
}

export interface EventsResponse {
  readonly siteId: string;
  readonly cellId: string;
  readonly from: string;
  readonly to: string;
  readonly truncated: boolean;
  readonly events: readonly CellEventView[];
}

const ApiCellParams = () =>
  applyDecorators(
    ApiParam({ name: 'siteId', example: 'demo', description: 'Planta' }),
    ApiParam({ name: 'cellId', example: 'cell-01', description: 'Célula' }),
  );

@ApiTags('Células')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido', schema: problemSchema })
@ApiForbiddenResponse({
  description: 'El usuario no tiene el rol necesario',
  schema: problemSchema,
})
@ApiBadRequestResponse({ description: 'Parámetros no válidos', schema: problemSchema })
@Controller('cells')
export class CellsController {
  constructor(private readonly store: CellStateStore) {}

  @Get()
  @ApiOperation({ summary: 'Estado actual de todas las células' })
  @ApiOkResponse({ schema: { type: 'array', items: cellSnapshotSchema } })
  list(): CellSnapshot[] {
    return this.store.snapshot();
  }
}

@ApiTags('Células')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido', schema: problemSchema })
@ApiForbiddenResponse({
  description: 'El usuario no tiene el rol necesario',
  schema: problemSchema,
})
@ApiBadRequestResponse({ description: 'Parámetros no válidos', schema: problemSchema })
@ApiNotFoundResponse({ description: 'Célula desconocida', schema: problemSchema })
@Controller('sites/:siteId/cells/:cellId')
export class CellController {
  constructor(
    private readonly store: CellStateStore,
    private readonly history: HistoryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado actual de una célula' })
  @ApiCellParams()
  @ApiOkResponse({ schema: cellSnapshotSchema })
  get(@Param(new ZodValidationPipe(cellParamsSchema)) params: CellParams): CellSnapshot {
    return this.#find(params);
  }

  @Get('production')
  @ApiOperation({
    summary: 'Producción de una célula en un periodo',
    description: `Cajas y palés producidos en [from, to), calculados por diferencias de los contadores acumulados. Las horas completas salen del histórico agregado. Sin fechas, las últimas 24 horas. Rango máximo: ${String(MAX_RANGE_DAYS)} días.`,
  })
  @ApiCellParams()
  @ApiQuery({ name: 'from', required: false, example: '2026-10-05T06:00:00.000Z' })
  @ApiQuery({ name: 'to', required: false, example: '2026-10-05T14:00:00.000Z' })
  @ApiOkResponse({ schema: productionSchema })
  async production(
    @Param(new ZodValidationPipe(cellParamsSchema)) params: CellParams,
    @Query(new ZodValidationPipe(productionQuerySchema())) query: ProductionQuery,
  ): Promise<ProductionResponse> {
    await this.#ensureKnown(params);
    const totals = await this.history.production(
      params.siteId,
      params.cellId,
      query.from,
      query.to,
    );
    return {
      siteId: params.siteId,
      cellId: params.cellId,
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      ...totals,
    };
  }

  @Get('history')
  @ApiOperation({
    summary: 'Histórico e indicadores de planta de una célula',
    description: `Producción, tiempos, disponibilidad, rendimiento y paradas por causa en [from, to), en total y por horas o por días (docs/indicadores-de-planta.md). Las fechas son horas en punto; por días, medianoches de \`timeZone\`. Sin fechas, las últimas 24 horas por horas, o los últimos 7 días por días, con el periodo en curso. Rango máximo: ${String(MAX_HISTORY_DAYS.hour)} días por horas y ${String(MAX_HISTORY_DAYS.day)} por días.`,
  })
  @ApiCellParams()
  @ApiQuery({ name: 'from', required: false, example: '2026-10-05T06:00:00.000Z' })
  @ApiQuery({ name: 'to', required: false, example: '2026-10-05T14:00:00.000Z' })
  @ApiQuery({ name: 'resolution', required: false, enum: ['hour', 'day'], example: 'hour' })
  @ApiQuery({
    name: 'timeZone',
    required: false,
    example: 'Europe/Madrid',
    description: 'Zona horaria IANA de los días; por defecto, UTC',
  })
  @ApiOkResponse({ schema: historySchema })
  async getHistory(
    @Param(new ZodValidationPipe(cellParamsSchema)) params: CellParams,
    @Query(new ZodValidationPipe(historyQuerySchema())) query: HistoryQuery,
  ): Promise<HistoryResponse> {
    await this.#ensureKnown(params);
    const history = await this.history.history(params.siteId, params.cellId, query);
    return {
      siteId: params.siteId,
      cellId: params.cellId,
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      resolution: query.resolution,
      timeZone: query.timeZone,
      ...history,
    };
  }

  @Get('events')
  @ApiOperation({
    summary: 'Registro de estados, alarmas y conexión de una célula',
    description: `Cambios de estado (con sus alarmas activas y su duración) y de conexión en [from, to), del más reciente al más antiguo. Sin fechas, las últimas 24 horas. Rango máximo: ${String(MAX_RANGE_DAYS)} días; como mucho ${String(MAX_EVENTS)} eventos (limit). truncated indica que el periodo tiene más.`,
  })
  @ApiCellParams()
  @ApiQuery({ name: 'from', required: false, example: '2026-10-05T06:00:00.000Z' })
  @ApiQuery({ name: 'to', required: false, example: '2026-10-05T14:00:00.000Z' })
  @ApiQuery({ name: 'limit', required: false, example: 200 })
  @ApiOkResponse({ schema: eventsSchema })
  async getEvents(
    @Param(new ZodValidationPipe(cellParamsSchema)) params: CellParams,
    @Query(new ZodValidationPipe(eventsQuerySchema())) query: EventsQuery,
  ): Promise<EventsResponse> {
    await this.#ensureKnown(params);
    const result = await this.history.events(
      params.siteId,
      params.cellId,
      query.from,
      query.to,
      query.limit,
    );
    return {
      siteId: params.siteId,
      cellId: params.cellId,
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      ...result,
    };
  }

  /**
   * El histórico existe aunque la célula no tenga estado en tiempo real, como
   * una célula cargada con histórico simulado (LF-85).
   */
  async #ensureKnown(params: CellParams): Promise<void> {
    if (
      this.#lookup(params) === undefined &&
      !(await this.history.hasData(params.siteId, params.cellId))
    ) {
      throw new NotFoundException(`No hay datos de la célula ${params.siteId}/${params.cellId}`);
    }
  }

  #lookup({ siteId, cellId }: CellParams): CellSnapshot | undefined {
    return this.store
      .snapshot()
      .find((candidate) => candidate.siteId === siteId && candidate.cellId === cellId);
  }

  #find({ siteId, cellId }: CellParams): CellSnapshot {
    const cell = this.#lookup({ siteId, cellId });
    if (cell === undefined) {
      throw new NotFoundException(`No hay datos de la célula ${siteId}/${cellId}`);
    }
    return cell;
  }
}

@ApiTags('Células')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido', schema: problemSchema })
@ApiForbiddenResponse({
  description: 'El usuario no tiene el rol necesario',
  schema: problemSchema,
})
@ApiBadRequestResponse({ description: 'Parámetros no válidos', schema: problemSchema })
@Controller('sites/:siteId')
export class SiteController {
  constructor(
    private readonly store: CellStateStore,
    private readonly history: HistoryService,
  ) {}

  @Get('comparison')
  @ApiOperation({
    summary: 'Comparar las células de una planta',
    description: `Indicadores de planta de cada célula en el mismo periodo [from, to), con el calendario de turnos (docs/indicadores-de-planta.md, LF-129). Las fechas, como en el histórico: horas en punto y, con resolution=day, medianoches de timeZone. Sin fechas, las últimas 24 horas. Rango máximo: ${String(MAX_HISTORY_DAYS.day)} días.`,
  })
  @ApiParam({ name: 'siteId', example: 'demo', description: 'Planta' })
  @ApiQuery({ name: 'from', required: false, example: '2026-10-04T22:00:00.000Z' })
  @ApiQuery({ name: 'to', required: false, example: '2026-10-05T22:00:00.000Z' })
  @ApiQuery({ name: 'resolution', required: false, enum: ['hour', 'day'], example: 'day' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'Europe/Madrid' })
  @ApiOkResponse({ schema: comparisonSchema })
  async compare(
    @Param(new ZodValidationPipe(siteParamsSchema)) params: SiteParams,
    @Query(new ZodValidationPipe(historyQuerySchema())) query: HistoryQuery,
  ): Promise<ComparisonResponse> {
    const known = this.store
      .snapshot()
      .filter((cell) => cell.siteId === params.siteId)
      .map((cell) => cell.cellId);
    const cells = await this.history.compare(params.siteId, known, query);
    return {
      siteId: params.siteId,
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      timeZone: query.timeZone,
      cells,
    };
  }
}
