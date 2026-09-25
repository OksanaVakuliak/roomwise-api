import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const engineeringPackageItemIdParamSchema = z.object({
  id: z.uuid(),
});

export class EngineeringPackageItemIdParamDto extends createZodDto(
  engineeringPackageItemIdParamSchema,
) {}
