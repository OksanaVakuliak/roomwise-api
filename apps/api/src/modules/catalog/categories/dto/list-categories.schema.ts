import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PublicationStatus } from '../../../../generated/prisma/enums';

export const listCategoriesQuerySchema = z.object({
  status: z.enum(PublicationStatus).optional(),
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

export class ListCategoriesQueryDto extends createZodDto(
  listCategoriesQuerySchema,
) {}
