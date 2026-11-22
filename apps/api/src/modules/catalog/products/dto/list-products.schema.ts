import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { paginationQuerySchema } from '../../../../common/pagination/pagination.schema';
import { searchTermSchema } from '../../../../common/search/search.schema';
import { PublicationStatus } from '../../../../generated/prisma/enums';

export const listProductsQuerySchema = paginationQuerySchema.extend({
  categoryId: z.uuid().optional(),
  status: z.enum(PublicationStatus).optional(),
  q: searchTermSchema.optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export class ListProductsQueryDto extends createZodDto(
  listProductsQuerySchema,
) {}
