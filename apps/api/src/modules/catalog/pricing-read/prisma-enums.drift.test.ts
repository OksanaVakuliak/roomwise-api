import {
  FinishLevelSchema,
  RoomTypeCodeSchema,
  RuleLevelSchema,
  ScopeSchema,
} from '@roomwise/calc-engine';
import { describe, expect, it } from 'vitest';
import {
  FinishLevel,
  RoomTypeCode,
  RuleLevel,
  Scope,
} from '../../../generated/prisma/enums';

describe('Prisma enums', () => {
  it.each([
    ['FinishLevel', FinishLevel, FinishLevelSchema],
    ['RoomTypeCode', RoomTypeCode, RoomTypeCodeSchema],
    ['RuleLevel', RuleLevel, RuleLevelSchema],
    ['Scope', Scope, ScopeSchema],
  ])('%s matches the calc-engine schema', (_name, prismaEnum, schema) => {
    expect(Object.values(prismaEnum).sort()).toEqual(
      [...schema.options].sort(),
    );
  });
});
