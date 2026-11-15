import { z } from 'zod';
import { realSizeMmSchema } from './real-size-mm.schema';

export const uploadImageBodySchema = z.object({
  realSizeMm: z.preprocess(
    (value) => (value === undefined || value === '' ? null : value),
    z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(realSizeMmSchema)
      .nullable(),
  ),
});
