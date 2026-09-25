import { Injectable } from '@nestjs/common';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { PublicationStatus } from '../../../generated/prisma/enums';
import type { PatchRoomTypeInput } from './dto/patch-room-type.schema';
import type { ReplaceRoomTypeCategoriesInput } from './dto/replace-room-type-categories.schema';
import type {
  RoomTypeAdmin,
  RoomTypeAdminListResponse,
} from './dto/room-type-admin.schema';

const ROOM_TYPE_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
  categories: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      category: {
        select: { id: true, name: true, status: true, surface: true },
      },
    },
  },
} satisfies Prisma.RoomTypeInclude;

type RoomTypeWithRelations = Prisma.RoomTypeGetPayload<{
  include: typeof ROOM_TYPE_ADMIN_INCLUDE;
}>;

function toRoomTypeAdmin(roomType: RoomTypeWithRelations): RoomTypeAdmin {
  return {
    id: roomType.id,
    code: roomType.code,
    name: toLocalizedText(roomType.name),
    categories: roomType.categories.map(({ category }) => ({
      id: category.id,
      name: toLocalizedText(category.name),
      status: category.status,
      surface: category.surface,
    })),
    revision: roomType.revision,
    updatedAt: roomType.updatedAt.toISOString(),
    updatedBy: roomType.updatedBy,
  };
}

@Injectable()
export class RoomTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<RoomTypeAdminListResponse> {
    const roomTypes = await this.prisma.roomType.findMany({
      orderBy: { sortOrder: 'asc' },
      include: ROOM_TYPE_ADMIN_INCLUDE,
    });

    return { items: roomTypes.map(toRoomTypeAdmin) };
  }

  async updateName(
    id: string,
    input: PatchRoomTypeInput,
    adminId: string,
  ): Promise<RoomTypeAdmin> {
    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: roomTypeId, expectedRevision, mutation }) => {
        const result = await this.prisma.roomType.updateMany({
          where: { id: roomTypeId, revision: expectedRevision },
          data: {
            name: input.name,
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (roomTypeId) => this.readRevision(roomTypeId),
    });

    return this.getById(id);
  }

  async replaceCategories(
    id: string,
    input: ReplaceRoomTypeCategoriesInput,
    adminId: string,
  ): Promise<RoomTypeAdmin> {
    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: ({ id: roomTypeId, expectedRevision, mutation }) =>
        this.prisma.$transaction(async (tx) => {
          await this.assertCategoriesAssignable(tx, input.categoryIds);

          const result = await tx.roomType.updateMany({
            where: { id: roomTypeId, revision: expectedRevision },
            data: {
              revision: mutation.revision,
              updatedAt: mutation.updatedAt,
              updatedById: mutation.updatedById,
            },
          });

          if (result.count === 0) {
            return 0;
          }

          await tx.roomTypeCategory.deleteMany({
            where: { roomTypeId },
          });

          if (input.categoryIds.length > 0) {
            await tx.roomTypeCategory.createMany({
              data: input.categoryIds.map((categoryId, index) => ({
                roomTypeId,
                categoryId,
                sortOrder: index,
              })),
            });
          }

          return result.count;
        }),
      readCurrentRevision: (roomTypeId) => this.readRevision(roomTypeId),
    });

    return this.getById(id);
  }

  private async assertCategoriesAssignable(
    tx: Prisma.TransactionClient,
    categoryIds: string[],
  ): Promise<void> {
    if (categoryIds.length === 0) {
      return;
    }

    const categories = await tx.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, status: true },
    });
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const notFound = categoryIds.filter((id) => !categoryById.has(id));
    if (notFound.length > 0) {
      throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, {
        params: { categoryIds: notFound },
      });
    }

    const archived = categoryIds.filter(
      (id) => categoryById.get(id)?.status === PublicationStatus.ARCHIVED,
    );
    if (archived.length > 0) {
      throw new AppError(ERROR_CODES.CATEGORY_ARCHIVED, {
        params: { categoryIds: archived },
      });
    }
  }

  private async readRevision(id: string): Promise<string | null> {
    const roomType = await this.prisma.roomType.findUnique({
      where: { id },
      select: { revision: true },
    });

    return roomType?.revision ?? null;
  }

  private async getById(id: string): Promise<RoomTypeAdmin> {
    const roomType = await this.prisma.roomType.findUnique({
      where: { id },
      include: ROOM_TYPE_ADMIN_INCLUDE,
    });

    if (!roomType) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return toRoomTypeAdmin(roomType);
  }
}
