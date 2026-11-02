import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class CoefficientsReadService {
  async lockExistingKeys(
    tx: Prisma.TransactionClient,
    keys: string[],
  ): Promise<Set<string>> {
    if (keys.length === 0) {
      return new Set();
    }

    const rows = await tx.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "coefficients" WHERE "key" = ANY(${[...new Set(keys)]}) FOR SHARE
    `;

    return new Set(rows.map((row) => row.key));
  }
}
