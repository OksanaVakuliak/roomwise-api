import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { realSizeMmSchema } from './real-size-mm.schema';

export const patchImageSchema = z.object({
  realSizeMm: realSizeMmSchema.nullable(),
});

export class PatchImageDto extends createZodDto(patchImageSchema) {}
