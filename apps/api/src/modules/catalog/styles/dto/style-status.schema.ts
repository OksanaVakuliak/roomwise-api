import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PublicationStatus } from '../../../../generated/prisma/enums';

export const updateStyleStatusSchema = z.object({
  status: z.enum(PublicationStatus),
  revision: z.uuid(),
});

export type UpdateStyleStatusInput = z.infer<typeof updateStyleStatusSchema>;

export class UpdateStyleStatusDto extends createZodDto(
  updateStyleStatusSchema,
) {}
