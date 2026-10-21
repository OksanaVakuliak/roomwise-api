import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ruleOrderSchema = z.object({
  ids: z.array(z.uuid()),
});

export type RuleOrderInput = z.infer<typeof ruleOrderSchema>;

export class RuleOrderDto extends createZodDto(ruleOrderSchema) {}
