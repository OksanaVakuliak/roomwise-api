import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../config/env';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('creates a client without connecting eagerly', async () => {
    const connect = vi.spyOn(PrismaClient.prototype, '$connect');
    const config = {
      get: vi
        .fn()
        .mockReturnValue(
          'postgresql://roomwise:roomwise@localhost:5432/roomwise_test',
        ),
    } as unknown as ConfigService<AppEnv, true>;

    const prisma = new PrismaService(config);

    expect(connect).not.toHaveBeenCalled();
    expect(config.get).toHaveBeenCalledWith('DATABASE_URL', { infer: true });

    const disconnect = vi
      .spyOn(PrismaClient.prototype, '$disconnect')
      .mockResolvedValue(undefined);

    await prisma.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
