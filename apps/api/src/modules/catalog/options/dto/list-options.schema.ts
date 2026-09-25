import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { OptionKind } from '../../../../generated/prisma/enums';

export const listOptionsQuerySchema = z.object({
  kind: z.enum(OptionKind).optional(),
});

export type ListOptionsQuery = z.infer<typeof listOptionsQuerySchema>;

export class ListOptionsQueryDto extends createZodDto(listOptionsQuerySchema) {}
