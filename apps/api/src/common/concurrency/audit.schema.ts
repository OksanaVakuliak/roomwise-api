import { z } from 'zod';

export const auditSchema = z.object({
  updatedAt: z.iso.datetime(),
  updatedBy: z
    .object({
      id: z.uuid(),
      login: z.string(),
    })
    .nullable(),
});

export type Audit = z.infer<typeof auditSchema>;
