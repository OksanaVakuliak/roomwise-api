import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import {
  OptionKind,
  OptionUnit,
  ProductUnit,
  PublicationStatus,
  RoomTypeCode,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import { CatalogPricingReadService } from './catalog-pricing-read.service';

function createPrisma(models: Record<string, unknown[]>) {
  const prisma: Record<string, unknown> = {};
  for (const [model, rows] of Object.entries(models)) {
    prisma[model] = { findMany: vi.fn().mockResolvedValue(rows) };
  }
  return prisma as unknown as PrismaService;
}

function createService(models: Record<string, unknown[]>) {
  const prisma = createPrisma(models);
  return { service: new CatalogPricingReadService(prisma), prisma };
}

describe('CatalogPricingReadService', () => {
  it('reads room types as id and code', async () => {
    const { service } = createService({
      roomType: [{ id: 'room-1', code: RoomTypeCode.KITCHEN }],
    });

    await expect(service.roomTypes()).resolves.toEqual([
      { id: 'room-1', code: RoomTypeCode.KITCHEN },
    ]);
  });

  it('converts category waste percent to a number', async () => {
    const { service } = createService({
      category: [
        {
          id: 'category-1',
          wastePercent: new Prisma.Decimal('10.50'),
          surface: SurfaceKind.FLOOR,
        },
      ],
    });

    await expect(service.categories()).resolves.toEqual([
      { id: 'category-1', wastePercent: 10.5, surface: SurfaceKind.FLOOR },
    ]);
  });

  it('reads material types as id and code', async () => {
    const { service } = createService({
      materialType: [{ id: 'material-1', code: 'tile' }],
    });

    await expect(service.materialTypes()).resolves.toEqual([
      { id: 'material-1', code: 'tile' },
    ]);
  });

  it.each([
    [PublicationStatus.PUBLISHED, true],
    [PublicationStatus.DRAFT, false],
    [PublicationStatus.ARCHIVED, false],
  ])('marks a %s product as available=%s', async (status, available) => {
    const { service } = createService({
      product: [
        {
          id: 'product-1',
          categoryId: 'category-1',
          materialTypeId: 'material-1',
          priceCents: 2500,
          unit: ProductUnit.SQM,
          wastePercentOverride: new Prisma.Decimal('7.25'),
          heatedFloorCompatible: true,
          status,
        },
      ],
    });

    await expect(service.products()).resolves.toEqual([
      {
        id: 'product-1',
        categoryId: 'category-1',
        materialTypeId: 'material-1',
        priceCents: 2500,
        unit: ProductUnit.SQM,
        wastePercentOverride: 7.25,
        heatedFloorCompatible: true,
        available,
      },
    ]);
  });

  it('keeps a missing product waste override as null', async () => {
    const { service } = createService({
      product: [
        {
          id: 'product-1',
          categoryId: 'category-1',
          materialTypeId: 'material-1',
          priceCents: 100,
          unit: ProductUnit.PIECE,
          wastePercentOverride: null,
          heatedFloorCompatible: false,
          status: PublicationStatus.PUBLISHED,
        },
      ],
    });

    const [product] = await service.products();

    expect(product.wastePercentOverride).toBeNull();
  });

  it('reads only published engineering package items', async () => {
    const { service, prisma } = createService({
      engineeringPackageItem: [
        {
          id: 'item-1',
          includedInBase: false,
          priceCents: 5000,
          unit: OptionUnit.ROOM,
        },
        { id: 'item-2', includedInBase: true, priceCents: null, unit: null },
      ],
    });

    await expect(service.packageItems()).resolves.toEqual([
      {
        id: 'item-1',
        includedInBase: false,
        priceCents: 5000,
        unit: OptionUnit.ROOM,
      },
      { id: 'item-2', includedInBase: true, priceCents: null, unit: null },
    ]);
    expect(prisma.engineeringPackageItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: PublicationStatus.PUBLISHED },
      }),
    );
  });

  it('flattens option room types into sorted codes and derives availability', async () => {
    const { service } = createService({
      option: [
        {
          id: 'option-1',
          kind: OptionKind.ADDITIONAL,
          priceCents: 1500,
          unit: OptionUnit.PIECE,
          minQuantity: 1,
          maxQuantity: 4,
          status: PublicationStatus.ARCHIVED,
          optionRoomTypes: [
            { roomType: { code: RoomTypeCode.KITCHEN } },
            { roomType: { code: RoomTypeCode.BEDROOM } },
          ],
        },
      ],
    });

    await expect(service.options()).resolves.toEqual([
      {
        id: 'option-1',
        kind: OptionKind.ADDITIONAL,
        priceCents: 1500,
        unit: OptionUnit.PIECE,
        roomTypeCodes: [RoomTypeCode.BEDROOM, RoomTypeCode.KITCHEN],
        minQuantity: 1,
        maxQuantity: 4,
        available: false,
      },
    ]);
  });

  it('returns the category ids that exist', async () => {
    const { service, prisma } = createService({
      category: [{ id: 'category-1' }],
    });

    const existing = await service.existingCategoryIds([
      'category-1',
      'category-2',
    ]);

    expect([...existing]).toEqual(['category-1']);
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['category-1', 'category-2'] } },
      select: { id: true },
    });
  });

  it('returns the material type ids that exist', async () => {
    const { service } = createService({
      materialType: [{ id: 'material-2' }],
    });

    const existing = await service.existingMaterialTypeIds([
      'material-1',
      'material-2',
    ]);

    expect([...existing]).toEqual(['material-2']);
  });

  it('skips the query when no ids are given', async () => {
    const { service, prisma } = createService({
      category: [],
      materialType: [],
    });

    expect((await service.existingCategoryIds([])).size).toBe(0);
    expect((await service.existingMaterialTypeIds([])).size).toBe(0);
    expect(prisma.category.findMany).not.toHaveBeenCalled();
    expect(prisma.materialType.findMany).not.toHaveBeenCalled();
  });
});
