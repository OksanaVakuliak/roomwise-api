import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const styleOrderSchema = z.object({
  styleIds: z.array(z.uuid()),
});

export type StyleOrderInput = z.infer<typeof styleOrderSchema>;

export class StyleOrderDto extends createZodDto(styleOrderSchema) {}
