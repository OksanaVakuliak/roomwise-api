import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const engineeringPackageItemOrderSchema = z.object({
  ids: z.array(z.uuid()),
});

export type EngineeringPackageItemOrderInput = z.infer<
  typeof engineeringPackageItemOrderSchema
>;

export class EngineeringPackageItemOrderDto extends createZodDto(
  engineeringPackageItemOrderSchema,
) {}
