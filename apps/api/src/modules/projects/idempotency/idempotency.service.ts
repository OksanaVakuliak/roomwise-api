import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { canonicalJson } from '../../../common/hashing/canonical-hash';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import type { IdempotencyKey, Prisma } from '../../../generated/prisma/client';
import type { IdempotencyScope } from '../../../generated/prisma/enums';

const UNIQUE_CONSTRAINT_ERROR = 'P2002';

export interface IdempotentResponse {
  status: number;
  body: unknown;
}

export type IdempotencyLoader = (
  row: IdempotencyKey,
) => Promise<IdempotentResponse>;

export interface RecordIdempotencyKey {
  scope: IdempotencyScope;
  key: string;
  requestHash: string;
  resultId: string;
  fakeLeadNumber?: number;
}

@Injectable()
export class IdempotencyService {
  private readonly loaders = new Map<IdempotencyScope, IdempotencyLoader>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  hashRequest(body: unknown): string {
    return createHash('sha256')
      .update(canonicalJson(body ?? null))
      .digest('hex');
  }

  find(scope: IdempotencyScope, key: string): Promise<IdempotencyKey | null> {
    return this.prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope, key } },
    });
  }

  async record(
    tx: Prisma.TransactionClient,
    { fakeLeadNumber, ...data }: RecordIdempotencyKey,
  ): Promise<void> {
    try {
      await tx.idempotencyKey.create({
        data: { ...data, fakeLeadNumber: fakeLeadNumber ?? null },
      });
    } catch (error) {
      if (isPrismaError(error, UNIQUE_CONSTRAINT_ERROR)) {
        throw new AppError(ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT, {
          cause: error,
        });
      }

      throw error;
    }
  }

  registerLoader(scope: IdempotencyScope, loader: IdempotencyLoader): void {
    this.loaders.set(scope, loader);
  }

  async replay(row: IdempotencyKey): Promise<IdempotentResponse> {
    const loader = this.loaders.get(row.scope);

    if (!loader) {
      throw new Error(`No idempotency loader registered for ${row.scope}`);
    }

    return loader(row);
  }
}
