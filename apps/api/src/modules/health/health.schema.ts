import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const componentStatusSchema = z.enum(['up', 'down']);

export const healthResponseSchema = z.object({
  service: z.literal('up'),
  database: componentStatusSchema,
});

export type ComponentStatus = z.infer<typeof componentStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export class HealthResponseDto extends createZodDto(healthResponseSchema) {}
