import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ComponentStatus, HealthResponse } from './health.schema';

const DATABASE_CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const database = await this.checkDatabase();

    return { service: 'up', database };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<ComponentStatus>((resolve) => {
      timer = setTimeout(() => resolve('down'), DATABASE_CHECK_TIMEOUT_MS);
    });

    const query = this.prisma.$queryRaw`SELECT 1`
      .then((): ComponentStatus => 'up')
      .catch((): ComponentStatus => 'down');

    const status = await Promise.race([query, timeout]);
    clearTimeout(timer);

    return status;
  }
}
