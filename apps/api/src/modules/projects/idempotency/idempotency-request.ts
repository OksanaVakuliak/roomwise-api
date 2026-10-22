import type { Request } from 'express';
import { z } from 'zod';
import type { IdempotencyScope } from '../../../generated/prisma/enums';
import { IDEMPOTENCY_HEADER } from './idempotency.constants';

export interface IdempotencyContextValue {
  scope: IdempotencyScope;
  key: string;
  requestHash: string;
}

export type IdempotentRequest = Request & {
  idempotency?: IdempotencyContextValue;
};

const uuidSchema = z.uuid();

export function readIdempotencyKey(request: Request): string | undefined {
  const parsed = uuidSchema.safeParse(request.header(IDEMPOTENCY_HEADER));

  return parsed.success ? parsed.data : undefined;
}
