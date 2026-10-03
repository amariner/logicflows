import { cellIdSchema, siteIdSchema } from '@logicflows/contract';
import { z } from 'zod';

import { isLocalMidnight } from '../history/time-zone.ts';

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

const HOUR_MS = 3_600_000;
export const MAX_HISTORY_DAYS = { hour: 31, day: 366 } as const;
export type Resolution = keyof typeof MAX_HISTORY_DAYS;

const isTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** La primera medianoche local en o después del instante, que debe ser una hora en punto. */
function nextMidnight(hour: number, timeZone: string): number {
  let candidate = hour;
  while (!isLocalMidnight(new Date(candidate), timeZone)) {
    candidate += HOUR_MS;
  }
  return candidate;
}

/**
 * Periodo del histórico: [from, to) en horas en punto y, por días, entre
 * medianoches de la zona horaria. Sin fechas: por horas, las últimas 24 horas
 * con la actual; por días, los últimos 7 días con el actual.
 */
export function historyQuerySchema(now: () => Date = () => new Date()) {
  return z
    .object({
      from: z.iso.datetime({ offset: true }).optional(),
      to: z.iso.datetime({ offset: true }).optional(),
      resolution: z.enum(['hour', 'day']).default('hour'),
      timeZone: z
        .string()
        .default('UTC')
        .refine(isTimeZone, { message: 'Zona horaria desconocida' }),
    })
    .transform(({ from, to, resolution, timeZone }) => {
      const nextHour = Math.ceil(now().getTime() / HOUR_MS) * HOUR_MS;
      const end =
        to === undefined
          ? new Date(resolution === 'hour' ? nextHour : nextMidnight(nextHour, timeZone))
          : new Date(to);
      let start: Date;
      if (from !== undefined) {
        start = new Date(from);
      } else if (resolution === 'hour') {
        start = new Date(end.getTime() - DAY_MS);
      } else {
        // Siete medianoches antes, contadas en la zona horaria (días de 23 o 25 horas).
        start = new Date(end.getTime());
        for (let days = 0; days < 7; days++) {
          start = new Date(start.getTime() - HOUR_MS);
          while (!isLocalMidnight(start, timeZone)) {
            start = new Date(start.getTime() - HOUR_MS);
          }
        }
      }
      return { from: start, to: end, resolution, timeZone };
    })
    .superRefine(({ from, to, resolution, timeZone }, context) => {
      for (const [field, date] of [
        ['from', from],
        ['to', to],
      ] as const) {
        if (date.getTime() % HOUR_MS !== 0) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'Debe ser una hora en punto',
          });
        } else if (resolution === 'day' && !isLocalMidnight(date, timeZone)) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `Por días, debe ser medianoche en ${timeZone}`,
          });
        }
      }
      if (from >= to) {
        context.addIssue({
          code: 'custom',
          path: ['from'],
          message: 'from debe ser anterior a to',
        });
      } else if (to.getTime() - from.getTime() > MAX_HISTORY_DAYS[resolution] * DAY_MS) {
        context.addIssue({
          code: 'custom',
          path: ['to'],
          message: `Por ${resolution === 'hour' ? 'horas' : 'días'}, el rango no puede superar ${String(MAX_HISTORY_DAYS[resolution])} días`,
        });
      }
    });
}
export type HistoryQuery = z.output<ReturnType<typeof historyQuerySchema>>;
