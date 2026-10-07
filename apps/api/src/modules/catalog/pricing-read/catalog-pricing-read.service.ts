import { Inject, Injectable } from '@nestjs/common';
import type {
  PricingCategory,
  PricingMaterialType,
  PricingOption,
  PricingPackageItem,
  PricingProduct,
  PricingRoomType,
} from '@roomwise/calc-engine';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PublicationStatus } from '../../../generated/prisma/enums';

@Injectable()
export class CatalogPricingReadService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async roomTypes(): Promise<PricingRoomType[]> {
    const rows = await this.prisma.roomType.findMany({
      select: { id: true, code: true },
      orderBy: { sortOrder: 'asc' },
    });

    return rows.map((row) => ({ id: row.id, code: row.code }));
  }

  async categories(): Promise<PricingCategory[]> {
    const rows = await this.prisma.category.findMany({
      select: { id: true, wastePercent: true, surface: true },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      wastePercent: row.wastePercent.toNumber(),
      surface: row.surface,
    }));
  }

  async materialTypes(): Promise<PricingMaterialType[]> {
    const rows = await this.prisma.materialType.findMany({
      select: { id: true, code: true },
      orderBy: { code: 'asc' },
    });

    return rows.map((row) => ({ id: row.id, code: row.code }));
  }

  async products(): Promise<PricingProduct[]> {
    const rows = await this.prisma.product.findMany({
      select: {
        id: true,
        categoryId: true,
        materialTypeId: true,
        priceCents: true,
        unit: true,
        wastePercentOverride: true,
        heatedFloorCompatible: true,
        status: true,
      },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      categoryId: row.categoryId,
      materialTypeId: row.materialTypeId,
      priceCents: row.priceCents,
      unit: row.unit,
      wastePercentOverride: row.wastePercentOverride?.toNumber() ?? null,
      heatedFloorCompatible: row.heatedFloorCompatible,
      available: row.status === PublicationStatus.PUBLISHED,
    }));
  }

  async packageItems(): Promise<PricingPackageItem[]> {
    const rows = await this.prisma.engineeringPackageItem.findMany({
      where: { status: PublicationStatus.PUBLISHED },
      select: {
        id: true,
        includedInBase: true,
        priceCents: true,
        unit: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      includedInBase: row.includedInBase,
      priceCents: row.priceCents,
      unit: row.unit,
    }));
  }

  async options(): Promise<PricingOption[]> {
    const rows = await this.prisma.option.findMany({
      select: {
        id: true,
        kind: true,
        priceCents: true,
        unit: true,
        minQuantity: true,
        maxQuantity: true,
        status: true,
        optionRoomTypes: { select: { roomType: { select: { code: true } } } },
      },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      priceCents: row.priceCents,
      unit: row.unit,
      roomTypeCodes: row.optionRoomTypes
        .map((link) => link.roomType.code)
        .sort(),
      minQuantity: row.minQuantity,
      maxQuantity: row.maxQuantity,
      available: row.status === PublicationStatus.PUBLISHED,
    }));
  }

  async existingCategoryIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }

    const rows = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  async existingMaterialTypeIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }

    const rows = await this.prisma.materialType.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }
}
