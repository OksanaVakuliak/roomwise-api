import { Injectable } from '@nestjs/common';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import type { Language } from '../../../common/i18n/resolve-lang';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  OptionUnit,
  PublicationStatus,
  SurfaceKind,
} from '../../../generated/prisma/enums';
import { isDefaultProductAvailable } from '../common/default-product-availability';
import { ImageUrlBuilder } from '../images/image-urls';
import type { PublicDefaultMaterialsResponse } from './dto/default-materials.schema';
import type { PublicEngineeringResponse } from './dto/engineering.schema';
import type { PublicProductCardsResponse } from './dto/product-card.schema';
import type {
  ProductSurface,
  PublicProductDetails,
} from './dto/product-details.schema';
import type { PublicRoomTypesResponse } from './dto/room-type.schema';
import type { PublicStylesResponse } from './dto/style.schema';

const PRIMARY_IMAGE_TAKE = 1;

function pickLocalized(value: unknown, lang: Language): string {
  return (value as LocalizedText)[lang];
}

@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageUrlBuilder: ImageUrlBuilder,
  ) {}

  async listStyles(lang: Language): Promise<PublicStylesResponse> {
    const styles = await this.prisma.style.findMany({
      where: { status: PublicationStatus.PUBLISHED },
      orderBy: { sortOrder: 'asc' },
      include: { image: true },
    });

    return {
      items: styles.map((style) => ({
        id: style.id,
        name: pickLocalized(style.name, lang),
        description: pickLocalized(style.description, lang),
        image: style.image
          ? this.imageUrlBuilder.toImageRef(style.image)
          : null,
      })),
    };
  }

  async listRoomTypes(lang: Language): Promise<PublicRoomTypesResponse> {
    const [roomTypes, categoryLinks, productCounts] = await Promise.all([
      this.prisma.roomType.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.roomTypeCategory.findMany({
        where: { category: { status: PublicationStatus.PUBLISHED } },
        orderBy: { sortOrder: 'asc' },
        include: { category: true },
      }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: {
          status: PublicationStatus.PUBLISHED,
          category: { status: PublicationStatus.PUBLISHED },
        },
        _count: { _all: true },
      }),
    ]);

    const productCountByCategory = new Map(
      productCounts.map((row) => [row.categoryId, row._count._all]),
    );

    const categoryLinksByRoomType = new Map<string, typeof categoryLinks>();
    for (const link of categoryLinks) {
      const links = categoryLinksByRoomType.get(link.roomTypeId);
      if (links) {
        links.push(link);
      } else {
        categoryLinksByRoomType.set(link.roomTypeId, [link]);
      }
    }

    return {
      items: roomTypes.map((roomType) => ({
        id: roomType.id,
        code: roomType.code,
        name: pickLocalized(roomType.name, lang),
        categories: (categoryLinksByRoomType.get(roomType.id) ?? []).map(
          (link) => ({
            id: link.category.id,
            name: pickLocalized(link.category.name, lang),
            surface: link.category.surface,
            wastePercent: link.category.wastePercent.toNumber(),
            productCount: productCountByCategory.get(link.category.id) ?? 0,
          }),
        ),
      })),
    };
  }

  async listCategoryProducts(
    categoryId: string,
    lang: Language,
  ): Promise<PublicProductCardsResponse> {
    const [category, products] = await Promise.all([
      this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { status: true },
      }),
      this.prisma.product.findMany({
        where: { categoryId, status: PublicationStatus.PUBLISHED },
        include: {
          materialType: { select: { code: true } },
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: PRIMARY_IMAGE_TAKE,
            include: { image: true },
          },
        },
      }),
    ]);

    if (!category || category.status !== PublicationStatus.PUBLISHED) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const items = products.map((product) => {
      const primaryImage = product.images[0]?.image;

      return {
        id: product.id,
        name: pickLocalized(product.name, lang),
        brand: product.brand,
        manufacturer: product.manufacturer,
        size: pickLocalized(product.size, lang),
        color: pickLocalized(product.color, lang),
        priceCents: product.priceCents,
        unit: product.unit,
        materialTypeCode: product.materialType.code,
        heatedFloorCompatible: product.heatedFloorCompatible,
        image: primaryImage
          ? this.imageUrlBuilder.toImageRef(primaryImage)
          : null,
      };
    });

    return {
      items: items.sort((left, right) => {
        const nameComparison = left.name.localeCompare(right.name, lang);
        return nameComparison !== 0
          ? nameComparison
          : left.id.localeCompare(right.id);
      }),
    };
  }

  async getProduct(
    productId: string,
    lang: Language,
  ): Promise<PublicProductDetails> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        materialType: { select: { code: true } },
        textureImage: true,
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          include: { image: true },
        },
        attributes: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    if (product.status !== PublicationStatus.PUBLISHED) {
      throw new AppError(ERROR_CODES.PRODUCT_UNAVAILABLE);
    }

    if (product.category.status !== PublicationStatus.PUBLISHED) {
      throw new AppError(ERROR_CODES.PRODUCT_UNAVAILABLE);
    }

    const wastePercent = (
      product.wastePercentOverride ?? product.category.wastePercent
    ).toNumber();

    return {
      id: product.id,
      categoryId: product.categoryId,
      name: pickLocalized(product.name, lang),
      description: pickLocalized(product.description, lang),
      brand: product.brand,
      manufacturer: product.manufacturer,
      size: pickLocalized(product.size, lang),
      color: pickLocalized(product.color, lang),
      priceCents: product.priceCents,
      unit: product.unit,
      materialTypeCode: product.materialType.code,
      heatedFloorCompatible: product.heatedFloorCompatible,
      wastePercent,
      images: product.images.map((productImage) =>
        this.imageUrlBuilder.toImageRef(productImage.image),
      ),
      attributes: product.attributes.map((attribute) => ({
        name: pickLocalized(attribute.name, lang),
        value: pickLocalized(attribute.value, lang),
      })),
      surface:
        product.category.surface === SurfaceKind.NONE
          ? null
          : this.buildSurface(
              product.category.surface,
              product.textureImage,
              product.tileWidthMm,
              product.tileLengthMm,
              product.fallbackColor,
            ),
    };
  }

  private buildSurface(
    surfaceKind: Exclude<SurfaceKind, 'NONE'>,
    textureImage: { id: string; publicId: string } | null,
    tileWidthMm: number | null,
    tileLengthMm: number | null,
    fallbackColor: string | null,
  ): ProductSurface | null {
    if (!textureImage || !tileWidthMm || !tileLengthMm || !fallbackColor) {
      return null;
    }

    return {
      kind: surfaceKind,
      texture: this.imageUrlBuilder.toTextureRef(textureImage),
      tileWidthMm,
      tileLengthMm,
      fallbackColor,
    };
  }

  async getStyleDefaultMaterials(
    styleId: string,
  ): Promise<PublicDefaultMaterialsResponse> {
    const [style, categoryLinks, defaults] = await Promise.all([
      this.prisma.style.findUnique({
        where: { id: styleId },
        select: { status: true },
      }),
      this.prisma.roomTypeCategory.findMany({
        where: { category: { status: PublicationStatus.PUBLISHED } },
        orderBy: { sortOrder: 'asc' },
        include: { roomType: { select: { code: true } } },
      }),
      this.prisma.styleDefaultMaterial.findMany({
        where: { styleId },
        include: {
          product: { select: { id: true, status: true, categoryId: true } },
        },
      }),
    ]);

    if (!style || style.status !== PublicationStatus.PUBLISHED) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const defaultsByPair = new Map(
      defaults.map((entry) => [
        `${entry.roomTypeId}:${entry.categoryId}`,
        entry.product,
      ]),
    );

    return {
      styleId,
      items: categoryLinks.map((link) => {
        const defaultProduct = defaultsByPair.get(
          `${link.roomTypeId}:${link.categoryId}`,
        );

        return {
          roomTypeCode: link.roomType.code,
          categoryId: link.categoryId,
          productId:
            defaultProduct &&
            isDefaultProductAvailable(defaultProduct, link.categoryId)
              ? defaultProduct.id
              : null,
        };
      }),
    };
  }

  async getEngineering(lang: Language): Promise<PublicEngineeringResponse> {
    const [packageItems, options] = await Promise.all([
      this.prisma.engineeringPackageItem.findMany({
        where: { status: PublicationStatus.PUBLISHED },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.option.findMany({
        where: { status: PublicationStatus.PUBLISHED },
        orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
        include: {
          image: true,
          optionRoomTypes: {
            orderBy: { roomType: { sortOrder: 'asc' } },
            include: { roomType: { select: { code: true } } },
          },
        },
      }),
    ]);

    return {
      packageItems: packageItems.map((item) => ({
        id: item.id,
        name: pickLocalized(item.name, lang),
        description: pickLocalized(item.description, lang),
        includedInBase: item.includedInBase,
        priceCents: item.includedInBase ? null : item.priceCents,
        unit: item.includedInBase ? null : item.unit,
      })),
      options: options.map((option) => ({
        id: option.id,
        kind: option.kind,
        name: pickLocalized(option.name, lang),
        description: pickLocalized(option.description, lang),
        image: option.image
          ? this.imageUrlBuilder.toImageRef(option.image)
          : null,
        priceCents: option.priceCents,
        unit: option.unit,
        perRoom:
          option.unit === OptionUnit.ROOM_SQM ||
          option.unit === OptionUnit.ROOM,
        roomTypeCodes: option.optionRoomTypes.map(
          (entry) => entry.roomType.code,
        ),
        minQuantity: option.minQuantity,
        maxQuantity: option.maxQuantity,
      })),
    };
  }
}
