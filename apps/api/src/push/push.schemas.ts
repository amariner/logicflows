import { z } from 'zod';

/** Token de FCM de un dispositivo. */
export const deviceSchema = z.object({
  token: z.string().min(1).max(4096),
});
export type DeviceRequest = z.infer<typeof deviceSchema>;
