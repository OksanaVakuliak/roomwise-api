import type { Configuration, PricingData } from '../schemas';

export interface LimitViolation {
  field: string;
  min: number;
  max: number;
}

export function checkLimits(
  configuration: Configuration,
  limits: PricingData['limits'],
  options: PricingData['options'] = [],
): LimitViolation[] {
  const violations: LimitViolation[] = [];
  const check = (field: string, value: number, min: number, max: number) => {
    if (value < min || value > max) {
      violations.push({ field, min, max });
    }
  };

  check(
    'totalAreaSqm',
    configuration.totalAreaSqm,
    limits.totalAreaSqm.min,
    limits.totalAreaSqm.max,
  );
  check(
    'balconyAreaSqm',
    configuration.balconyAreaSqm,
    0,
    configuration.totalAreaSqm,
  );
  check(
    'rooms',
    configuration.rooms.length,
    limits.rooms.min,
    limits.rooms.max,
  );

  configuration.rooms.forEach((room, index) => {
    const path = `rooms[${index}]`;
    check(
      `${path}.lengthM`,
      room.lengthM,
      limits.roomSideM.min,
      limits.roomSideM.max,
    );
    check(
      `${path}.widthM`,
      room.widthM,
      limits.roomSideM.min,
      limits.roomSideM.max,
    );
    check(
      `${path}.heightM`,
      room.heightM,
      limits.roomHeightM.min,
      limits.roomHeightM.max,
    );
  });

  configuration.options.forEach((selection, index) => {
    const option = options.find(
      (candidate) => candidate.id === selection.optionId,
    );
    if (option?.unit !== 'PIECE' || selection.quantity === undefined) {
      return;
    }
    check(
      `options[${index}].quantity`,
      selection.quantity,
      option.minQuantity ?? 1,
      option.maxQuantity ?? Number.MAX_SAFE_INTEGER,
    );
  });

  return violations;
}
