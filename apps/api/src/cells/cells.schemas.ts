import { cellIdSchema, siteIdSchema } from '@logicflows/contract';
import { z } from 'zod';

const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 31;

export const cellParamsSchema = z.object({
  siteId: siteIdSchema,
  cellId: cellIdSchema,
});
export type CellParams = z.infer<typeof cellParamsSchema>;

/**
 * Rango de la consulta de producción: [from, to). Sin fechas, las últimas 24
 * horas. Se admiten fechas ISO 8601 con zona horaria.
 */
export function productionQuerySchema(now: () => Date = () => new Date()) {
  return z
    .object({
      from: z.iso.datetime({ offset: true }).optional(),
      to: z.iso.datetime({ offset: true }).optional(),
    })
    .transform(({ from, to }) => {
      const end = to === undefined ? now() : new Date(to);
      const start = from === undefined ? new Date(end.getTime() - DAY_MS) : new Date(from);
      return { from: start, to: end };
    })
    .refine(({ from, to }) => from < to, {
      message: 'from debe ser anterior a to',
      path: ['from'],
    })
    .refine(({ from, to }) => to.getTime() - from.getTime() <= MAX_RANGE_DAYS * DAY_MS, {
      message: `El rango no puede superar ${String(MAX_RANGE_DAYS)} días`,
      path: ['to'],
    });
}
export type ProductionQuery = z.output<ReturnType<typeof productionQuerySchema>>;
