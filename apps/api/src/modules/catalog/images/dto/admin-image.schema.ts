import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const adminImageSchema = z.object({
  id: z.uuid(),
  thumb: z.url(),
  card: z.url(),
  zoom: z.url(),
  texture: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  realSizeMm: z.number().int().positive().nullable(),
});

export type AdminImage = z.infer<typeof adminImageSchema>;

export class AdminImageDto extends createZodDto(adminImageSchema) {}
