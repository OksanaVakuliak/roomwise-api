import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const patchImageSchema = z.object({
  realSizeMm: z.number().int().positive().nullable(),
});

export class PatchImageDto extends createZodDto(patchImageSchema) {}
