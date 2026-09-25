import { randomUUID } from 'node:crypto';
import { OptionKind, OptionUnit } from '../../src/generated/prisma/client';
import { type LocalizedText, localizedText } from './admin-catalog-fixtures';

export interface PackageItemInputOverrides {
  name?: LocalizedText;
  description?: LocalizedText;
  includedInBase?: boolean;
  priceCents?: number;
  unit?: OptionUnit;
}

export interface PackageItemInput {
  name: LocalizedText;
  description: LocalizedText;
  includedInBase: boolean;
  priceCents?: number;
  unit?: OptionUnit;
}

export function buildPackageItemInput(
  overrides: PackageItemInputOverrides = {},
): PackageItemInput {
  const suffix = randomUUID().slice(0, 8);

  return {
    name:
      overrides.name ??
      localizedText(`Package Item ${suffix}`, `Пункт пакета ${suffix}`),
    description:
      overrides.description ??
      localizedText('A test package item.', 'Тестовий пункт пакета.'),
    includedInBase: overrides.includedInBase ?? true,
    priceCents: overrides.priceCents,
    unit: overrides.unit,
  };
}

export interface OptionInputOverrides {
  kind?: OptionKind;
  name?: LocalizedText;
  description?: LocalizedText;
  imageId?: string;
  priceCents?: number;
  confirmZeroPrice?: boolean;
  unit?: OptionUnit;
  minQuantity?: number;
  maxQuantity?: number;
  roomTypeIds?: string[];
}

export interface OptionInput {
  kind: OptionKind;
  name: LocalizedText;
  description: LocalizedText;
  imageId?: string;
  priceCents: number;
  confirmZeroPrice: boolean;
  unit: OptionUnit;
  minQuantity?: number;
  maxQuantity?: number;
  roomTypeIds: string[];
}

const DEFAULT_OPTION_PRICE_CENTS = 1500;

export function buildOptionInput(
  overrides: OptionInputOverrides = {},
): OptionInput {
  const suffix = randomUUID().slice(0, 8);

  return {
    kind: overrides.kind ?? OptionKind.ENGINEERING,
    name:
      overrides.name ?? localizedText(`Option ${suffix}`, `Опція ${suffix}`),
    description:
      overrides.description ??
      localizedText('A test option.', 'Тестова опція.'),
    imageId: overrides.imageId,
    priceCents: overrides.priceCents ?? DEFAULT_OPTION_PRICE_CENTS,
    confirmZeroPrice: overrides.confirmZeroPrice ?? false,
    unit: overrides.unit ?? OptionUnit.PROJECT,
    minQuantity: overrides.minQuantity,
    maxQuantity: overrides.maxQuantity,
    roomTypeIds: overrides.roomTypeIds ?? [],
  };
}
