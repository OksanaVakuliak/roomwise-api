import { describe, expect, it } from 'vitest';
import { createLeadRequestSchema } from './create-lead.schema';

const base = {
  name: 'Oksana',
  phone: '+380671234567',
  consent: { accepted: true, text: 'I agree' },
  locale: 'uk',
};

const calculation = { publicId: 'abc123', versionNumber: 2 };
const draft = {
  configuration: {
    finishLevel: 'ROUGH',
    totalAreaSqm: 50,
    balconyAreaSqm: 0,
    balconyTiles: false,
    gas: true,
    kitchenType: 'SEPARATE',
    rooms: [
      {
        clientId: 'r1',
        roomTypeCode: 'BEDROOM',
        lengthM: 4,
        widthM: 3,
        heightM: 2.7,
        heatedFloor: false,
        selections: [{ categoryId: 'c1', productId: 'p1' }],
      },
    ],
    options: [],
    currency: 'USD',
  },
  styleId: '6f1c1f0e-8a4b-4d5e-9c3a-2b7d8e9f0a1b',
  clientPricingVersion: 'a1b2c3d4e5f60718',
};

function failedPaths(input: unknown): string[] {
  const result = createLeadRequestSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('createLeadRequestSchema', () => {
  it('accepts a request with calculation', () => {
    expect(
      createLeadRequestSchema.safeParse({ ...base, calculation }).success,
    ).toBe(true);
  });

  it('accepts a request with draft', () => {
    const result = createLeadRequestSchema.safeParse({ ...base, draft });
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it('accepts empty website and optional fields', () => {
    expect(
      createLeadRequestSchema.safeParse({
        ...base,
        calculation,
        website: '',
        email: 'user@example.com',
        comment: 'hi',
      }).success,
    ).toBe(true);
  });

  it('rejects both calculation and draft', () => {
    expect(failedPaths({ ...base, calculation, draft })).toContain(
      'calculation',
    );
  });

  it('rejects neither calculation nor draft', () => {
    expect(failedPaths(base)).toContain('calculation');
  });

  it('rejects consent.accepted false', () => {
    expect(
      failedPaths({
        ...base,
        calculation,
        consent: { accepted: false, text: 'x' },
      }),
    ).toContain('consent.accepted');
  });

  it('rejects a name of only spaces', () => {
    expect(failedPaths({ ...base, calculation, name: '   ' })).toContain(
      'name',
    );
  });

  it('rejects a name of 101 characters', () => {
    expect(
      failedPaths({ ...base, calculation, name: 'a'.repeat(101) }),
    ).toContain('name');
  });

  it('rejects a missing phone', () => {
    const { phone: _phone, ...rest } = base;
    expect(failedPaths({ ...rest, calculation })).toContain('phone');
  });

  it('rejects an invalid email', () => {
    expect(failedPaths({ ...base, calculation, email: 'nope' })).toContain(
      'email',
    );
  });

  it('rejects a comment of 1001 characters', () => {
    expect(
      failedPaths({ ...base, calculation, comment: 'a'.repeat(1001) }),
    ).toContain('comment');
  });
});
