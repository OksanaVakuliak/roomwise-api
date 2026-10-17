import {
  type EstimateLine,
  type EstimateTotals,
  type EstimateWarning,
  SectionSchema,
  type SectionTotal,
} from '../schemas';

function sumTotal(
  lines: readonly EstimateLine[],
  hasRate: boolean,
): SectionTotal {
  return {
    usdCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
    uahKopecks: hasRate
      ? lines.reduce((sum, line) => sum + (line.amountUahKopecks ?? 0), 0)
      : null,
  };
}

export function computeTotals(
  lines: readonly EstimateLine[],
  hasRate: boolean,
): EstimateTotals {
  const sections = Object.fromEntries(
    SectionSchema.options.map((section) => [
      section,
      sumTotal(
        lines.filter((line) => line.section === section),
        hasRate,
      ),
    ]),
  ) as EstimateTotals['sections'];
  return { ...sumTotal(lines, hasRate), sections };
}

export function collectWarnings(
  lines: readonly EstimateLine[],
): EstimateWarning[] {
  return lines.flatMap((line) =>
    line.warnings.map((warning) => ({ ...warning, lineId: line.id })),
  );
}

export function isIncomplete(lines: readonly EstimateLine[]): boolean {
  return lines.some(
    (line) => line.status === 'ERROR' || line.status === 'NOT_CALCULATED',
  );
}
