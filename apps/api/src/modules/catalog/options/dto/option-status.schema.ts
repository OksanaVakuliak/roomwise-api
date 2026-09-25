import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PublicationStatus } from '../../../../generated/prisma/enums';

export const updateOptionStatusSchema = z.object({
  status: z.enum(PublicationStatus),
  revision: z.uuid(),
});

export type UpdateOptionStatusInput = z.infer<typeof updateOptionStatusSchema>;

export class UpdateOptionStatusDto extends createZodDto(
  updateOptionStatusSchema,
) {}
