import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class CoefficientsReadService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async existingKeys(keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) {
      return new Set();
    }

    const rows = await this.prisma.coefficient.findMany({
      where: { key: { in: [...new Set(keys)] } },
      select: { key: true },
    });

    return new Set(rows.map((row) => row.key));
  }
}
