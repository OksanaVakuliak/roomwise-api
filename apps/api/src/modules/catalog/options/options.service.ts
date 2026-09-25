import { Inject, Injectable } from '@nestjs/common';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { assertTranslations } from '../../../common/i18n/translation-check';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import { Prisma } from '../../../generated/prisma/client';
import { OptionUnit, PublicationStatus } from '../../../generated/prisma/enums';
import { assertImagesExist } from '../images/assert-images-exist';
import { ImageUrlBuilder } from '../images/image-urls';
import type { CreateOptionInput } from './dto/create-option.schema';
import type { ListOptionsQuery } from './dto/list-options.schema';
import type {
  OptionAdmin,
  OptionAdminListResponse,
} from './dto/option-admin.schema';
import type { OptionOrderInput } from './dto/option-order.schema';
import type { UpdateOptionStatusInput } from './dto/option-status.schema';
import type { PatchOptionInput } from './dto/patch-option.schema';

const OPTION_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
  image: { select: { id: true, publicId: true } },
  optionRoomTypes: { select: { roomTypeId: true } },
} satisfies Prisma.OptionInclude;

type OptionWithRelations = Prisma.OptionGetPayload<{
  include: typeof OPTION_ADMIN_INCLUDE;
}>;

interface PublishableCandidate {
  name: LocalizedText;
  description: LocalizedText;
  priceCents: number;
}

interface ResolvedQuantityBounds {
  minQuantity: number | null;
  maxQuantity: number | null;
}

function isPerRoomUnit(unit: OptionUnit): boolean {
  return unit === OptionUnit.ROOM_SQM || unit === OptionUnit.ROOM;
}

@Injectable()
export class OptionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ImageUrlBuilder) private readonly imageUrls: ImageUrlBuilder,
  ) {}

  async list(query: ListOptionsQuery): Promise<OptionAdminListResponse> {
    const options = await this.prisma.option.findMany({
      where: query.kind ? { kind: query.kind } : {},
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
      include: OPTION_ADMIN_INCLUDE,
    });

    return { items: options.map((option) => this.toOptionAdmin(option)) };
  }

  async get(id: string): Promise<OptionAdmin> {
    return this.getById(id);
  }

  async create(
    input: CreateOptionInput,
    adminId: string,
  ): Promise<OptionAdmin> {
    const perRoom = isPerRoomUnit(input.unit);

    if (input.roomTypeIds.length > 0 && !perRoom) {
      throw new AppError(ERROR_CODES.ROOM_TYPES_NOT_ALLOWED);
    }

    const bounds = this.resolveQuantityBounds(
      input.unit,
      input.minQuantity,
      input.maxQuantity,
    );
    this.assertZeroPriceConfirmed(input.priceCents, input.confirmZeroPrice);

    await Promise.all([
      input.imageId
        ? assertImagesExist(this.prisma, [input.imageId])
        : Promise.resolve(),
      perRoom && input.roomTypeIds.length > 0
        ? this.assertRoomTypesExist(this.prisma, input.roomTypeIds)
        : Promise.resolve(),
    ]);

    const aggregate = await this.prisma.option.aggregate({
      _max: { sortOrder: true },
      where: { kind: input.kind },
    });
    const sortOrder = (aggregate._max.sortOrder ?? -1) + 1;

    const created = await this.prisma.option.create({
      data: {
        kind: input.kind,
        name: input.name,
        description: input.description,
        imageId: input.imageId ?? null,
        priceCents: input.priceCents,
        unit: input.unit,
        minQuantity: bounds.minQuantity,
        maxQuantity: bounds.maxQuantity,
        sortOrder,
        status: PublicationStatus.DRAFT,
        updatedById: adminId,
        optionRoomTypes:
          perRoom && input.roomTypeIds.length > 0
            ? {
                create: input.roomTypeIds.map((roomTypeId) => ({ roomTypeId })),
              }
            : undefined,
      },
      include: OPTION_ADMIN_INCLUDE,
    });

    return this.toOptionAdmin(created);
  }

  async update(
    id: string,
    input: PatchOptionInput,
    adminId: string,
  ): Promise<OptionAdmin> {
    const existing = await this.prisma.option.findUnique({
      where: { id },
      select: {
        kind: true,
        status: true,
        name: true,
        description: true,
        priceCents: true,
        unit: true,
        minQuantity: true,
        maxQuantity: true,
      },
    });

    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const resolvedUnit = input.unit ?? existing.unit;
    const perRoom = isPerRoomUnit(resolvedUnit);

    if (
      input.roomTypeIds !== undefined &&
      input.roomTypeIds.length > 0 &&
      !perRoom
    ) {
      throw new AppError(ERROR_CODES.ROOM_TYPES_NOT_ALLOWED);
    }

    const resolvedMinQuantity =
      input.minQuantity !== undefined
        ? input.minQuantity
        : existing.minQuantity;
    const resolvedMaxQuantity =
      input.maxQuantity !== undefined
        ? input.maxQuantity
        : existing.maxQuantity;
    const bounds = this.resolveQuantityBounds(
      resolvedUnit,
      resolvedMinQuantity ?? undefined,
      resolvedMaxQuantity ?? undefined,
    );

    const resolvedPriceCents =
      input.priceCents !== undefined ? input.priceCents : existing.priceCents;
    if (input.priceCents !== undefined) {
      this.assertZeroPriceConfirmed(resolvedPriceCents, input.confirmZeroPrice);
    }

    await Promise.all([
      input.imageId !== undefined && input.imageId !== null
        ? assertImagesExist(this.prisma, [input.imageId])
        : Promise.resolve(),
      input.roomTypeIds !== undefined && perRoom && input.roomTypeIds.length > 0
        ? this.assertRoomTypesExist(this.prisma, input.roomTypeIds)
        : Promise.resolve(),
    ]);

    if (existing.status === PublicationStatus.PUBLISHED) {
      this.assertPublishable({
        name: input.name ?? toLocalizedText(existing.name),
        description: input.description ?? toLocalizedText(existing.description),
        priceCents: resolvedPriceCents,
      });
    }

    const kindChanged =
      input.kind !== undefined && input.kind !== existing.kind;

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: ({ id: optionId, expectedRevision, mutation }) =>
        this.prisma.$transaction(async (tx) => {
          let sortOrderUpdate: { sortOrder: number } | Record<string, never> =
            {};

          if (kindChanged) {
            const aggregate = await tx.option.aggregate({
              _max: { sortOrder: true },
              where: { kind: input.kind },
            });
            sortOrderUpdate = {
              sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
            };
          }

          const result = await tx.option.updateMany({
            where: { id: optionId, revision: expectedRevision },
            data: {
              ...(input.kind !== undefined ? { kind: input.kind } : {}),
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.description !== undefined
                ? { description: input.description }
                : {}),
              ...(input.imageId !== undefined
                ? { imageId: input.imageId }
                : {}),
              ...(input.priceCents !== undefined
                ? { priceCents: input.priceCents }
                : {}),
              ...(input.unit !== undefined ? { unit: input.unit } : {}),
              minQuantity: bounds.minQuantity,
              maxQuantity: bounds.maxQuantity,
              ...sortOrderUpdate,
              revision: mutation.revision,
              updatedAt: mutation.updatedAt,
              updatedById: mutation.updatedById,
            },
          });

          if (result.count === 0) {
            return 0;
          }

          if (!perRoom) {
            await tx.optionRoomType.deleteMany({ where: { optionId } });
          } else if (input.roomTypeIds !== undefined) {
            await tx.optionRoomType.deleteMany({ where: { optionId } });

            if (input.roomTypeIds.length > 0) {
              await tx.optionRoomType.createMany({
                data: input.roomTypeIds.map((roomTypeId) => ({
                  optionId,
                  roomTypeId,
                })),
              });
            }
          }

          return result.count;
        }),
      readCurrentRevision: (optionId) => this.readRevision(optionId),
    });

    return this.getById(id);
  }

  async reorder(input: OptionOrderInput, adminId: string): Promise<void> {
    const existing = await this.prisma.option.findMany({
      where: { kind: input.kind },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((option) => option.id));
    const providedIds = new Set(input.ids);

    const isMismatched =
      providedIds.size !== input.ids.length ||
      providedIds.size !== existingIds.size ||
      input.ids.some((id) => !existingIds.has(id));

    if (isMismatched) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
        params: { ids: input.ids },
      });
    }

    const updatedAt = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const [index, id] of input.ids.entries()) {
          await tx.option.update({
            where: { id },
            data: {
              sortOrder: -(index + 1),
              updatedAt,
              updatedById: adminId,
            },
          });
        }

        for (const [index, id] of input.ids.entries()) {
          await tx.option.update({
            where: { id },
            data: {
              sortOrder: index,
              updatedAt,
              updatedById: adminId,
            },
          });
        }
      });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
          params: { ids: input.ids },
        });
      }

      throw error;
    }
  }

  async updateStatus(
    id: string,
    input: UpdateOptionStatusInput,
    adminId: string,
  ): Promise<OptionAdmin> {
    if (input.status === PublicationStatus.PUBLISHED) {
      const option = await this.prisma.option.findUnique({
        where: { id },
        select: { name: true, description: true, priceCents: true },
      });

      if (!option) {
        throw new AppError(ERROR_CODES.NOT_FOUND);
      }

      this.assertPublishable({
        name: toLocalizedText(option.name),
        description: toLocalizedText(option.description),
        priceCents: option.priceCents,
      });
    }

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: optionId, expectedRevision, mutation }) => {
        const result = await this.prisma.option.updateMany({
          where: { id: optionId, revision: expectedRevision },
          data: {
            status: input.status,
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (optionId) => this.readRevision(optionId),
    });

    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.prisma.option.deleteMany({ where: { id } });

    if (result.count === 0) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }
  }

  private resolveQuantityBounds(
    unit: OptionUnit,
    minQuantity: number | undefined,
    maxQuantity: number | undefined,
  ): ResolvedQuantityBounds {
    if (unit !== OptionUnit.PIECE) {
      return { minQuantity: null, maxQuantity: null };
    }

    if (
      minQuantity === undefined ||
      maxQuantity === undefined ||
      minQuantity > maxQuantity
    ) {
      throw new AppError(ERROR_CODES.QUANTITY_BOUNDS_REQUIRED);
    }

    return { minQuantity, maxQuantity };
  }

  private assertZeroPriceConfirmed(
    priceCents: number,
    confirmZeroPrice: boolean | undefined,
  ): void {
    if (priceCents === 0 && confirmZeroPrice !== true) {
      throw new AppError(ERROR_CODES.ZERO_PRICE_NOT_CONFIRMED);
    }
  }

  private assertPublishable(candidate: PublishableCandidate): void {
    assertTranslations({
      name: candidate.name,
      description: candidate.description,
    });

    if (candidate.priceCents === 0) {
      throw new AppError(ERROR_CODES.PRICE_REQUIRED);
    }
  }

  private async assertRoomTypesExist(
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
      throw new AppError(ERROR_CODES.UNPROCESSABLE, {
        params: { roomTypeIds: missing },
      });
    }
  }

  private async readRevision(id: string): Promise<string | null> {
    const option = await this.prisma.option.findUnique({
      where: { id },
      select: { revision: true },
    });

    return option?.revision ?? null;
  }

  private async getById(id: string): Promise<OptionAdmin> {
    const option = await this.prisma.option.findUnique({
      where: { id },
      include: OPTION_ADMIN_INCLUDE,
    });

    if (!option) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return this.toOptionAdmin(option);
  }

  private toOptionAdmin(option: OptionWithRelations): OptionAdmin {
    return {
      id: option.id,
      kind: option.kind,
      name: toLocalizedText(option.name),
      description: toLocalizedText(option.description),
      image: option.image ? this.imageUrls.toImageRef(option.image) : null,
      priceCents: option.priceCents,
      unit: option.unit,
      perRoom: isPerRoomUnit(option.unit),
      minQuantity: option.minQuantity,
      maxQuantity: option.maxQuantity,
      roomTypeIds: option.optionRoomTypes.map((entry) => entry.roomTypeId),
      sortOrder: option.sortOrder,
      status: option.status,
      revision: option.revision,
      updatedAt: option.updatedAt.toISOString(),
      updatedBy: option.updatedBy,
    };
  }
}
