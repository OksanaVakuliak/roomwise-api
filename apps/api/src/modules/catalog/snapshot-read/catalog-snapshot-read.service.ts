import { Inject, Injectable } from '@nestjs/common';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  ProductUnit,
  RoomTypeCode,
} from '../../../generated/prisma/enums';
import { type ImageSource, ImageUrlBuilder } from '../images/image-urls';
import type { ImageRef } from '../public/dto/image-ref.schema';

export interface SnapshotIds {
  productIds: string[];
  categoryIds: string[];
  roomTypeIds: string[];
  optionIds: string[];
  packageItemIds: string[];
  styleId: string | null;
}

export interface SnapshotNamed {
  id: string;
  name: LocalizedText;
}

export interface SnapshotProduct extends SnapshotNamed {
  brand: string;
  manufacturer: string;
  color: LocalizedText;
  size: LocalizedText;
  unit: ProductUnit;
  image: ImageSource | null;
}

export interface SnapshotRoomType extends SnapshotNamed {
  code: RoomTypeCode;
}

export interface CatalogSnapshotData {
  products: Map<string, SnapshotProduct>;
  categories: Map<string, SnapshotNamed>;
  roomTypes: Map<string, SnapshotRoomType>;
  options: Map<string, SnapshotNamed>;
  packageItems: Map<string, SnapshotNamed>;
  style: SnapshotNamed | null;
}

function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function toNamed(row: { id: string; name: unknown }): SnapshotNamed {
  return { id: row.id, name: toLocalizedText(row.name) };
}

@Injectable()
export class CatalogSnapshotReadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ImageUrlBuilder) private readonly imageUrls: ImageUrlBuilder,
  ) {}

  imageRef(image: ImageSource): ImageRef {
    return this.imageUrls.toImageRef(image);
  }

  async read(ids: SnapshotIds): Promise<CatalogSnapshotData> {
    const [products, categories, roomTypes, options, packageItems, style] =
      await Promise.all([
        this.products(ids.productIds),
        this.categories(ids.categoryIds),
        this.roomTypes(ids.roomTypeIds),
        this.options(ids.optionIds),
        this.packageItems(ids.packageItemIds),
        this.style(ids.styleId),
      ]);

    return { products, categories, roomTypes, options, packageItems, style };
  }

  private async products(ids: string[]): Promise<Map<string, SnapshotProduct>> {
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        brand: true,
        manufacturer: true,
        color: true,
        size: true,
        unit: true,
        images: {
          select: { image: { select: { id: true, publicId: true } } },
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
        },
      },
    });

    return indexById(
      rows.map((row) => ({
        ...toNamed(row),
        brand: row.brand,
        manufacturer: row.manufacturer,
        color: toLocalizedText(row.color),
        size: toLocalizedText(row.size),
        unit: row.unit,
        image: row.images[0]?.image ?? null,
      })),
    );
  }

  private async categories(ids: string[]): Promise<Map<string, SnapshotNamed>> {
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    return indexById(rows.map(toNamed));
  }

  private async roomTypes(
    ids: string[],
  ): Promise<Map<string, SnapshotRoomType>> {
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.roomType.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true },
    });

    return indexById(rows.map((row) => ({ ...toNamed(row), code: row.code })));
  }

  private async options(ids: string[]): Promise<Map<string, SnapshotNamed>> {
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.option.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    return indexById(rows.map(toNamed));
  }

  private async packageItems(
    ids: string[],
  ): Promise<Map<string, SnapshotNamed>> {
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.engineeringPackageItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    return indexById(rows.map(toNamed));
  }

  private async style(id: string | null): Promise<SnapshotNamed | null> {
    if (id === null) {
      return null;
    }

    const row = await this.prisma.style.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    return row === null ? null : toNamed(row);
  }
}
