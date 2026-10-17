import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ruleIdParamSchema = z.object({
  id: z.uuid(),
});

export class RuleIdParamDto extends createZodDto(ruleIdParamSchema) {}
