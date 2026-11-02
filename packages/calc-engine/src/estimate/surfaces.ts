import type {
  EstimateLine,
  EstimateMessage,
  LineComponent,
  PricingData,
  PricingRule,
  RoomConfiguration,
} from '../schemas';
import type { ObjectVariables } from '../variables';
import { roomVariables } from '../variables';
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
  const areas: Record<Surface, number> = {
    FLOOR: variables.floorArea,
    CEILING: variables.floorArea,
    WALLS: variables.wallArea,
  };
  const surfaces = new Map<Surface, number[]>();
  lines.forEach((line, index) => {
    const surface = data.categories.find(
      (category) => category.id === line.categoryId,
    )?.surface;
    if (line.status === 'OK' && surface !== undefined && surface !== 'NONE') {
      surfaces.set(surface, [...(surfaces.get(surface) ?? []), index]);
    }
  });
  for (const [surface, indexes] of surfaces) {
    const rule = surfaceRuleOf(data, surface);
    if (rule === undefined) {
      continue;
    }
    const outcome = runNumericFormula(rule.costFormula, {
      variables: { ...variables, surfaceArea: areas[surface] },
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
