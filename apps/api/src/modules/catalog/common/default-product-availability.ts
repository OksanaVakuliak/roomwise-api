import { PublicationStatus } from '../../../generated/prisma/enums';

export interface DefaultProductAvailabilityCandidate {
  status: PublicationStatus;
  categoryId: string;
}

export function isDefaultProductAvailable(
  product: DefaultProductAvailabilityCandidate,
  categoryId: string,
): boolean {
  return (
    product.status === PublicationStatus.PUBLISHED &&
    product.categoryId === categoryId
  );
}
