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
import type { Indicators } from '../history/indicators.ts';
import { CellStateStore } from '../realtime/cell-state.store.ts';
import {
  cellParamsSchema,
  historyQuerySchema,
  MAX_HISTORY_DAYS,
  MAX_RANGE_DAYS,
  productionQuerySchema,
} from './cells.schemas.ts';
import type { CellParams, HistoryQuery, ProductionQuery } from './cells.schemas.ts';
import {
  cellSnapshotSchema,
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
    description: `Cajas y pallets producidos en [from, to), calculados por diferencias de los contadores acumulados. Las horas completas salen del histórico agregado. Sin fechas, las últimas 24 horas. Rango máximo: ${String(MAX_RANGE_DAYS)} días.`,
  })
  @ApiCellParams()
  @ApiQuery({ name: 'from', required: false, example: '2026-10-05T06:00:00.000Z' })
  @ApiQuery({ name: 'to', required: false, example: '2026-10-05T14:00:00.000Z' })
  @ApiOkResponse({ schema: productionSchema })
  async production(
    @Param(new ZodValidationPipe(cellParamsSchema)) params: CellParams,
    @Query(new ZodValidationPipe(productionQuerySchema())) query: ProductionQuery,
  ): Promise<ProductionResponse> {
    this.#find(params);
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
    this.#find(params);
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

  #find({ siteId, cellId }: CellParams): CellSnapshot {
    const cell = this.store
      .snapshot()
      .find((candidate) => candidate.siteId === siteId && candidate.cellId === cellId);
    if (cell === undefined) {
      throw new NotFoundException(`No hay datos de la célula ${siteId}/${cellId}`);
    }
    return cell;
  }
}
