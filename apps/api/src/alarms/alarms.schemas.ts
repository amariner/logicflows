import { alarmSchema, cellIdSchema, siteIdSchema } from '@logicflows/contract';
import { z } from 'zod';

export const alarmParamsSchema = z.object({
  siteId: siteIdSchema,
  cellId: cellIdSchema,
  code: alarmSchema.shape.code,
});
export type AlarmParams = z.infer<typeof alarmParamsSchema>;

/** La activación que se reconoce: el momento en que se activó la alarma. */
export const acknowledgementBodySchema = z.object({
  raisedAt: z.iso.datetime({ offset: true }),
});
export type AcknowledgementBody = z.infer<typeof acknowledgementBodySchema>;
