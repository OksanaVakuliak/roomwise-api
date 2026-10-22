import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { canonicalSha256 } from '../../../common/hashing/canonical-hash';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import type { IdempotencyKey, Prisma } from '../../../generated/prisma/client';
import type { IdempotencyScope } from '../../../generated/prisma/enums';
import { readIdempotencyKey } from './idempotency-request';

const UNIQUE_CONSTRAINT_ERROR = 'P2002';

export interface IdempotentResponse {
  status: number;
  body: unknown;
}

export type IdempotencyLoader = (
  row: IdempotencyKey,
  request: Request,
) => Promise<IdempotentResponse>;

export interface RecordIdempotencyKey {
  scope: IdempotencyScope;
  key: string;
  requestHash: string;
  resultId: string;
  fakeLeadNumber?: number;
}

export interface IdempotencyLookup {
  key: string;
  requestHash: string;
  row: IdempotencyKey | null;
}

@Injectable()
export class IdempotencyService {
  private readonly loaders = new Map<IdempotencyScope, IdempotencyLoader>();
  private readonly lookups = new WeakMap<
    Request,
    Promise<IdempotencyLookup | null>
  >();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  hashRequest(request: Request): string {
    return canonicalSha256({
      params: request.params ?? {},
      query: request.query ?? {},
      body: request.body ?? null,
    });
  }

  lookup(
    request: Request,
    scope: IdempotencyScope,
  ): Promise<IdempotencyLookup | null> {
    let lookup = this.lookups.get(request);

    if (!lookup) {
      lookup = this.readLookup(request, scope);
      this.lookups.set(request, lookup);
    }

    return lookup;
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

  async replay(
    row: IdempotencyKey,
    request: Request,
  ): Promise<IdempotentResponse> {
    const loader = this.loaders.get(row.scope);

    if (!loader) {
      throw new Error(`No idempotency loader registered for ${row.scope}`);
    }

    return loader(row, request);
  }

  private async readLookup(
    request: Request,
    scope: IdempotencyScope,
  ): Promise<IdempotencyLookup | null> {
    const key = readIdempotencyKey(request);

    if (!key) {
      return null;
    }

    return {
      key,
      requestHash: this.hashRequest(request),
      row: await this.find(scope, key),
    };
  }
}
