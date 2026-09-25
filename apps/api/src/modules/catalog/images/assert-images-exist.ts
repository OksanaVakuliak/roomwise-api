import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { Prisma } from '../../../generated/prisma/client';

export async function assertImagesExist(
  prisma: Prisma.TransactionClient,
  imageIds: string[],
): Promise<void> {
  if (imageIds.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(imageIds)];
  const found = await prisma.image.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((image) => image.id));
  const missing = uniqueIds.filter((imageId) => !foundIds.has(imageId));

  if (missing.length > 0) {
    throw new AppError(ERROR_CODES.IMAGE_NOT_FOUND, {
      params: { imageIds: missing },
    });
  }
}
