import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const uploadImageBodySchema = z.object({
  realSizeMm: z.preprocess(
    (value) => (value === undefined || value === '' ? null : value),
    z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().positive())
      .nullable(),
  ),
});

export class UploadImageBodyDto extends createZodDto(uploadImageBodySchema) {}
