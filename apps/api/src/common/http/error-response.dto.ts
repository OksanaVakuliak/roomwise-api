import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const errorFieldSchema = z.object({
  path: z.string(),
  code: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
    fields: z.array(errorFieldSchema).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export class ErrorResponseDto extends createZodDto(errorResponseSchema) {}
