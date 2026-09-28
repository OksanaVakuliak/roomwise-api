import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { isPrismaError } from './prisma-error';

describe('isPrismaError', () => {
  it('returns true for a PrismaClientKnownRequestError with the matching code', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Conflict', {
      code: 'P2002',
      clientVersion: 'test',
    });

    expect(isPrismaError(error, 'P2002')).toBe(true);
  });

  it('returns false for a PrismaClientKnownRequestError with a different code', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: 'test',
    });

    expect(isPrismaError(error, 'P2002')).toBe(false);
  });

  it('returns false for a non-Prisma error', () => {
    expect(isPrismaError(new Error('plain error'), 'P2002')).toBe(false);
  });

  it('returns false for a non-error value', () => {
    expect(isPrismaError(undefined, 'P2002')).toBe(false);
  });
});
