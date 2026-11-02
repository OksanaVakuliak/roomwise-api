import { z } from 'zod';

export const COEFFICIENT_KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;

export const coefficientKeySchema = z.string().regex(COEFFICIENT_KEY_PATTERN);
