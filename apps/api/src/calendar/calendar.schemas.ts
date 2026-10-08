import { siteIdSchema } from '@logicflows/contract';
import { z } from 'zod';

import { shiftProblems } from './calendar.ts';
import type { Weekday } from './calendar.ts';

const isTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const siteParamsSchema = z.object({ siteId: siteIdSchema });
export type SiteParams = z.infer<typeof siteParamsSchema>;

export const versionParamsSchema = z.object({
  siteId: siteIdSchema,
  effectiveFrom: z.iso.date(),
});
export type VersionParams = z.infer<typeof versionParamsSchema>;

export const exceptionParamsSchema = z.object({ siteId: siteIdSchema, date: z.iso.date() });
export type ExceptionParams = z.infer<typeof exceptionParamsSchema>;

const hour = z.number().int().min(0).max(23);
const name = z.string().trim().min(1).max(40);

const shiftSchema = z.object({
  weekday: z
    .number()
    .int()
    .min(1)
    .max(7)
    .transform((value) => value as Weekday),
  start: hour,
  end: hour,
  name,
});

/** Una versión del calendario: zona horaria y turnos semanales sin solapes. */
export const versionBodySchema = z
  .object({
    timeZone: z.string().refine(isTimeZone, 'Zona horaria IANA desconocida'),
    shifts: z.array(shiftSchema).max(7 * 24),
  })
  .superRefine((body, context) => {
    for (const message of shiftProblems(body.shifts)) {
      context.addIssue({ code: 'custom', path: ['shifts'], message });
    }
  });
export type VersionBody = z.infer<typeof versionBodySchema>;

export const exceptionBodySchema = z.object({ name: z.string().trim().min(1).max(80) });
export type ExceptionBody = z.infer<typeof exceptionBodySchema>;
