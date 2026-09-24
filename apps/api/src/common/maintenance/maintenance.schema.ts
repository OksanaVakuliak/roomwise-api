import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const maintenanceTaskStatusSchema = z.enum([
  'SKIPPED_NOT_DUE',
  'SUCCESS',
  'FAILED',
]);

export const maintenanceRunResponseSchema = z.object({
  tasks: z.array(
    z.object({
      name: z.string(),
      status: maintenanceTaskStatusSchema,
    }),
  ),
});

export type MaintenanceRunResponse = z.infer<
  typeof maintenanceRunResponseSchema
>;

export class MaintenanceRunResponseDto extends createZodDto(
  maintenanceRunResponseSchema,
) {}
