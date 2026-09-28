import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PublicationStatus } from '../../../../generated/prisma/enums';

export const updateCategoryStatusSchema = z.object({
  status: z.enum(PublicationStatus),
  revision: z.uuid(),
});

export type UpdateCategoryStatusInput = z.infer<
  typeof updateCategoryStatusSchema
>;

export class UpdateCategoryStatusDto extends createZodDto(
  updateCategoryStatusSchema,
) {}
