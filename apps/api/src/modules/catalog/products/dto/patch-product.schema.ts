import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createProductSchema } from './create-product.schema';

export const patchProductSchema = createProductSchema
  .partial()
  .extend({ revision: z.uuid() })
  .strict();

export type PatchProductInput = z.infer<typeof patchProductSchema>;

export class PatchProductDto extends createZodDto(patchProductSchema) {}
