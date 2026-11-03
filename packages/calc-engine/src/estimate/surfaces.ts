import type {
  EstimateLine,
  EstimateMessage,
  LineComponent,
  PricingData,
  PricingRule,
  RoomConfiguration,
} from '../schemas';
import type { ObjectVariables } from '../variables';
import { puttyShareOn, roomVariables, surfaceAreaOf } from '../variables';
import { componentCents, failedLine, MAX_LINE_CENTS, outOfRange } from './line';
import { runNumericFormula } from './run-formula';

type Surface = 'FLOOR' | 'WALLS' | 'CEILING';

function surfaceRuleOf(
  data: PricingData,
  surface: Surface,
): PricingRule | undefined {
  return data.rules
    .filter((rule) => rule.level === 'SURFACE' && rule.surface === surface)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
}

function failedWith(line: EstimateLine, error: EstimateMessage): EstimateLine {
  return failedLine(
    {
      id: line.id,
      section: line.section,
      roomClientId: line.roomClientId,
      categoryId: line.categoryId,
      productId: line.productId,
      ruleId: line.ruleId,
      warnings: line.warnings,
    },
    'ERROR',
    error,
  );
}

function withComponent(
  line: EstimateLine,
  component: LineComponent,
): EstimateLine {
  const components = [...(line.components ?? []), component];
  const amountCents = components.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  );
  if (amountCents > MAX_LINE_CENTS) {
    return failedWith(line, outOfRange());
  }
  return { ...line, components, amountCents };
}

export function applySurfacePrep(
  data: PricingData,
  room: RoomConfiguration,
  lines: readonly EstimateLine[],
  objectScope: ObjectVariables,
): EstimateLine[] {
  const result = [...lines];
  const variables = {
    ...roomVariables(room),
    ...objectScope,
  };
  const surfaces = new Map<Surface, number[]>();
  lines.forEach((line, index) => {
    const category = data.categories.find(
      (item) => item.id === line.categoryId,
    );
    if (
      line.status === 'OK' &&
      category !== undefined &&
      category.surface !== 'NONE'
    ) {
      const surface = category.surface;
      surfaces.set(surface, [...(surfaces.get(surface) ?? []), index]);
    }
  });
  for (const [surface, indexes] of surfaces) {
    const rule = surfaceRuleOf(data, surface);
    if (rule === undefined) {
      continue;
    }
    const surfaceArea = surfaceAreaOf(variables, surface);
    const puttyShare = puttyShareOn(room, surface, data.categories);
    const outcome = runNumericFormula(rule.costFormula, {
      variables: {
        ...variables,
        surfaceArea,
        puttyRequired: puttyShare > 0,
        puttyArea: surfaceArea * puttyShare,
      },
      coefficients: data.coefficients,
    });
    const cents = outcome.ok ? componentCents(outcome.value) : null;
    const carrierCategoryId = lines[indexes[0] as number]?.categoryId ?? null;
    indexes.forEach((index, position) => {
      const line = lines[index] as EstimateLine;
      if (!outcome.ok || cents === null) {
        result[index] = failedWith(
          line,
          outcome.ok ? outOfRange() : outcome.error,
        );
        return;
      }
      result[index] = withComponent(
        line,
        position === 0
          ? { kind: 'PREP', ruleId: rule.id, amountCents: cents }
          : {
              kind: 'PREP',
              ruleId: rule.id,
              amountCents: 0,
              sharedWithCategoryId: carrierCategoryId ?? undefined,
            },
      );
    });
  }
  return result;
}
