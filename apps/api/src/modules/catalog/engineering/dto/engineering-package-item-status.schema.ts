import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PublicationStatus } from '../../../../generated/prisma/enums';

export const updateEngineeringPackageItemStatusSchema = z.object({
  status: z.enum(PublicationStatus),
  revision: z.uuid(),
});

export type UpdateEngineeringPackageItemStatusInput = z.infer<
  typeof updateEngineeringPackageItemStatusSchema
>;

export class UpdateEngineeringPackageItemStatusDto extends createZodDto(
  updateEngineeringPackageItemStatusSchema,
) {}
