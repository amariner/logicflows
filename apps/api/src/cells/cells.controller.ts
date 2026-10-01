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
import { TelemetryRepository } from '../persistence/telemetry.repository.ts';
import { CellStateStore } from '../realtime/cell-state.store.ts';
import { cellParamsSchema, MAX_RANGE_DAYS, productionQuerySchema } from './cells.schemas.ts';
import type { CellParams, ProductionQuery } from './cells.schemas.ts';
import { cellSnapshotSchema, problemSchema, productionSchema } from './openapi.schemas.ts';

export interface ProductionResponse {
  readonly siteId: string;
  readonly cellId: string;
  readonly from: string;
  readonly to: string;
  readonly boxes: number;
  readonly pallets: number;
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
    private readonly repository: TelemetryRepository,
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
    description: `Cajas y pallets producidos en [from, to), calculados por diferencias de los contadores acumulados. Sin fechas, las últimas 24 horas. Rango máximo: ${String(MAX_RANGE_DAYS)} días.`,
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
    const totals = await this.repository.production(
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
