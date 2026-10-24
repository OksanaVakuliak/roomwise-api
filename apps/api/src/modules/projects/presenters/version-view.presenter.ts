import { Inject, Injectable } from '@nestjs/common';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import type { Language } from '../../../common/i18n/resolve-lang';
import { CatalogSnapshotReadService } from '../../catalog/snapshot-read/catalog-snapshot-read.service';
import { type SnapshotV1, SnapshotV1Schema } from '../snapshot/snapshot.schema';
import type { VersionView } from './version-view.schema';

export interface PresentVersionInput {
  publicId: string;
  version: {
    number: number;
    snapshot: SnapshotV1;
    pricingVersion: string;
    incomplete: boolean;
    expiresAt: Date;
    createdAt: Date;
  };
  versions: {
    number: number;
    createdAt: Date;
    totalUsdCents: number;
    expiresAt: Date;
  }[];
  lang: Language;
  now: Date;
}

export function parseStoredSnapshot(value: unknown): SnapshotV1 {
  return SnapshotV1Schema.parse(value);
}

function pick(text: LocalizedText, lang: Language): string {
  return text[lang];
}

function pickNullable(
  text: LocalizedText | null,
  lang: Language,
): string | null {
  return text === null ? null : pick(text, lang);
}

function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

@Injectable()
export class VersionViewPresenter {
  constructor(
    @Inject(CatalogSnapshotReadService)
    private readonly catalog: CatalogSnapshotReadService,
  ) {}

  present(input: PresentVersionInput): VersionView {
    const { publicId, version, versions, lang, now } = input;
    const { snapshot } = version;

    return {
      publicId,
      number: version.number,
      createdAt: version.createdAt.toISOString(),
      expiresAt: version.expiresAt.toISOString(),
      expired: isExpired(version.expiresAt, now),
      incomplete: version.incomplete,
      pricingVersion: version.pricingVersion,
      style:
        snapshot.style === null
          ? null
          : { id: snapshot.style.id, name: pick(snapshot.style.name, lang) },
      configuration: snapshot.configuration,
      rooms: snapshot.rooms.map(({ roomTypeName, ...room }) => ({
        ...room,
        name: pick(roomTypeName, lang),
      })),
      lines: snapshot.lines.map((line) => ({
        ...line,
        roomName: pickNullable(line.roomName, lang),
        categoryName: pickNullable(line.categoryName, lang),
        optionName: pickNullable(line.optionName, lang),
        packageItemName: pickNullable(line.packageItemName, lang),
        ruleName: pickNullable(line.ruleName, lang),
        product:
          line.product === null
            ? null
            : {
                name: pick(line.product.name, lang),
                brand: line.product.brand,
                manufacturer: line.product.manufacturer,
                color: pick(line.product.color, lang),
                size: pick(line.product.size, lang),
                image:
                  line.product.image === null
                    ? null
                    : this.catalog.imageRef(line.product.image),
              },
      })),
      totals: snapshot.estimate.totals,
      warnings: snapshot.estimate.warnings,
      exchangeRate: snapshot.pricing.exchangeRate,
      versions: [...versions]
        .sort((a, b) => b.number - a.number)
        .map((item) => ({
          number: item.number,
          createdAt: item.createdAt.toISOString(),
          totalUsdCents: item.totalUsdCents,
          expired: isExpired(item.expiresAt, now),
        })),
    };
  }
}
