import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client';
import { assertRoomTypesExist } from './assert-room-types-exist';

function createPrisma(foundIds: string[]) {
  return {
    roomType: {
      findMany: vi.fn().mockResolvedValue(foundIds.map((id) => ({ id }))),
    },
  } as unknown as Prisma.TransactionClient;
}

describe('assertRoomTypesExist', () => {
  it('resolves without querying when given no ids', async () => {
    const prisma = createPrisma([]);

    await expect(assertRoomTypesExist(prisma, [])).resolves.toBeUndefined();
    expect(
      prisma.roomType.findMany as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
  });

  it('resolves when every id is found', async () => {
    const prisma = createPrisma(['room-1', 'room-2']);

    await expect(
      assertRoomTypesExist(prisma, ['room-1', 'room-2']),
    ).resolves.toBeUndefined();
  });

  it('deduplicates ids before checking existence', async () => {
    const prisma = createPrisma(['room-1']);

    await assertRoomTypesExist(prisma, ['room-1', 'room-1']);

    expect(prisma.roomType.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['room-1'] } },
      select: { id: true },
    });
  });

  it('throws ROOM_TYPE_NOT_FOUND with the missing ids', async () => {
    const prisma = createPrisma(['room-1']);

    await expect(
      assertRoomTypesExist(prisma, ['room-1', 'missing']),
    ).rejects.toMatchObject({
      code: 'ROOM_TYPE_NOT_FOUND',
      params: { roomTypeIds: ['missing'] },
    });
  });
});
