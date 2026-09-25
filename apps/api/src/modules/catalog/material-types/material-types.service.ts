import { Injectable } from '@nestjs/common';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { assertTranslations } from '../../../common/i18n/translation-check';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPrismaError } from '../../../common/prisma/prisma-error';
import { Prisma } from '../../../generated/prisma/client';
import { PublicationStatus } from '../../../generated/prisma/enums';
import type { CreateMaterialTypeInput } from './dto/create-material-type.schema';
import type {
  MaterialTypeAdmin,
  MaterialTypeAdminListResponse,
} from './dto/material-type-admin.schema';
import type { UpdateMaterialTypeInput } from './dto/update-material-type.schema';

const MATERIAL_TYPE_ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
} satisfies Prisma.MaterialTypeInclude;

type MaterialTypeWithRelations = Prisma.MaterialTypeGetPayload<{
  include: typeof MATERIAL_TYPE_ADMIN_INCLUDE;
}>;

function toMaterialTypeAdmin(
  materialType: MaterialTypeWithRelations,
): MaterialTypeAdmin {
  return {
    id: materialType.id,
    code: materialType.code,
    name: toLocalizedText(materialType.name),
    status: materialType.status,
    revision: materialType.revision,
    updatedAt: materialType.updatedAt.toISOString(),
    updatedBy: materialType.updatedBy,
  };
}

@Injectable()
export class MaterialTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<MaterialTypeAdminListResponse> {
    const materialTypes = await this.prisma.materialType.findMany({
      orderBy: { code: 'asc' },
      include: MATERIAL_TYPE_ADMIN_INCLUDE,
    });

    return { items: materialTypes.map(toMaterialTypeAdmin) };
  }

  async create(
    input: CreateMaterialTypeInput,
    adminId: string,
  ): Promise<MaterialTypeAdmin> {
    await this.assertCodeAvailable(input.code);

    try {
      const created = await this.prisma.materialType.create({
        data: {
          code: input.code,
          name: input.name,
          updatedById: adminId,
        },
        include: MATERIAL_TYPE_ADMIN_INCLUDE,
      });

      return toMaterialTypeAdmin(created);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new AppError(ERROR_CODES.CODE_TAKEN);
      }

      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateMaterialTypeInput,
    adminId: string,
  ): Promise<MaterialTypeAdmin> {
    const existing = await this.prisma.materialType.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const nextName = input.name ?? toLocalizedText(existing.name);
    const nextStatus = input.status ?? existing.status;

    if (nextStatus === PublicationStatus.PUBLISHED) {
      assertTranslations({ name: nextName });
    }

    await updateWithRevision({
      id,
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ id: materialTypeId, expectedRevision, mutation }) => {
        const result = await this.prisma.materialType.updateMany({
          where: { id: materialTypeId, revision: expectedRevision },
          data: {
            name: nextName,
            status: nextStatus,
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: (materialTypeId) =>
        this.readRevision(materialTypeId),
    });

    return this.getById(id);
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const existing = await this.prisma.materialType.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      throw new AppError(ERROR_CODES.CODE_TAKEN);
    }
  }

  private async readRevision(id: string): Promise<string | null> {
    const materialType = await this.prisma.materialType.findUnique({
      where: { id },
      select: { revision: true },
    });

    return materialType?.revision ?? null;
  }

  private async getById(id: string): Promise<MaterialTypeAdmin> {
    const materialType = await this.prisma.materialType.findUnique({
      where: { id },
      include: MATERIAL_TYPE_ADMIN_INCLUDE,
    });

    if (!materialType) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    return toMaterialTypeAdmin(materialType);
  }
}
