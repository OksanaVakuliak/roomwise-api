import { OptionCodeSchema } from '@roomwise/calc-engine';
import { describe, expect, it } from 'vitest';
import { OptionCode } from '../../../generated/prisma/enums';

describe('OptionCode', () => {
  it('matches the calc-engine OptionCodeSchema', () => {
    expect(Object.values(OptionCode).sort()).toEqual(
      [...OptionCodeSchema.options].sort(),
    );
  });
});
