import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { OptionKind } from '../../../../generated/prisma/enums';

export const optionOrderSchema = z.object({
  kind: z.enum(OptionKind),
  ids: z.array(z.uuid()),
});

export type OptionOrderInput = z.infer<typeof optionOrderSchema>;

export class OptionOrderDto extends createZodDto(optionOrderSchema) {}
