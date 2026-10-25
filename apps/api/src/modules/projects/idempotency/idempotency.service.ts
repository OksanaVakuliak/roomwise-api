import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { Clock } from '../../../common/clock/clock';
import { canonicalSha256 } from '../../../common/hashing/canonical-hash';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import type { IdempotencyKey, Prisma } from '../../../generated/prisma/client';
import type { IdempotencyScope } from '../../../generated/prisma/enums';
import { IDEMPOTENCY_KEY_TTL_MS } from './idempotency.constants';
import { readIdempotencyKey } from './idempotency-request';

const UNIQUE_CONSTRAINT_ERROR = 'P2002';

export type IdempotencyLoader = (
  row: IdempotencyKey,
  request: Request,
) => Promise<unknown>;

export interface RecordIdempotencyKey {
  scope: IdempotencyScope;
  key: string;
  requestHash: string;
  resultId: string;
  fakeLeadNumber?: number;
  createdAt?: Date;
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
    Map<IdempotencyScope, Promise<IdempotencyLookup | null>>
  >();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

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
    let byScope = this.lookups.get(request);

    if (!byScope) {
      byScope = new Map();
      this.lookups.set(request, byScope);
    }

    let lookup = byScope.get(scope);

    if (!lookup) {
      lookup = this.readLookup(request, scope);
      byScope.set(scope, lookup);
    }

    return lookup;
  }

  async find(
    scope: IdempotencyScope,
    key: string,
  ): Promise<IdempotencyKey | null> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope, key } },
    });

    return row && row.createdAt >= this.cutoff() ? row : null;
  }

  async record(
    tx: Prisma.TransactionClient,
    { fakeLeadNumber, ...data }: RecordIdempotencyKey,
  ): Promise<void> {
    try {
      await tx.idempotencyKey.deleteMany({
        where: {
          scope: data.scope,
          key: data.key,
          createdAt: { lt: this.cutoff() },
        },
      });
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

  async replay(row: IdempotencyKey, request: Request): Promise<unknown> {
    const loader = this.loaders.get(row.scope);

    if (!loader) {
      throw new Error(`No idempotency loader registered for ${row.scope}`);
    }

    return loader(row, request);
  }

  private cutoff(): Date {
    return new Date(this.clock.now().getTime() - IDEMPOTENCY_KEY_TTL_MS);
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
