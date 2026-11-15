import { z } from 'zod';

export const REAL_SIZE_MM_MAX = 10_000;

export const realSizeMmSchema = z
  .number()
  .int()
  .positive()
  .max(REAL_SIZE_MM_MAX);
