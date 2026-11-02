import { z } from 'zod';
import { SurfaceKind } from '../../generated/prisma/enums';

export const ruleSurfaceSchema = z.enum([
  SurfaceKind.FLOOR,
  SurfaceKind.WALLS,
  SurfaceKind.CEILING,
]);

export type RuleSurface = z.infer<typeof ruleSurfaceSchema>;
