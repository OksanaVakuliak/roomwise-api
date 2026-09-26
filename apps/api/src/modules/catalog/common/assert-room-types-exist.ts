import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { Prisma } from '../../../generated/prisma/client';

export async function assertRoomTypesExist(
  prisma: Prisma.TransactionClient,
  roomTypeIds: string[],
): Promise<void> {
  if (roomTypeIds.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(roomTypeIds)];
  const found = await prisma.roomType.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((roomType) => roomType.id));
  const missing = uniqueIds.filter((roomTypeId) => !foundIds.has(roomTypeId));

  if (missing.length > 0) {
    throw new AppError(ERROR_CODES.ROOM_TYPE_NOT_FOUND, {
      params: { roomTypeIds: missing },
    });
  }
}
