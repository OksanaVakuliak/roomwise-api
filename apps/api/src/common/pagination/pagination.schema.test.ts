import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE,
  paginationQuerySchema,
} from './pagination.schema';

describe('paginationQuerySchema', () => {
  it('applies defaults and coerces query strings', () => {
    expect(paginationQuerySchema.parse({})).toEqual({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '100' })).toEqual(
      {
        page: 2,
        pageSize: 100,
      },
    );
  });

  it('rejects page sizes above the API limit', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(
      false,
    );
  });

  it('accepts a page size exactly at the API limit', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 100 }).success).toBe(
      true,
    );
  });

  it('rejects page numbers below the minimum', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: -1 }).success).toBe(false);
  });

  it('rejects non-numeric page values', () => {
    expect(paginationQuerySchema.safeParse({ page: 'abc' }).success).toBe(
      false,
    );
  });

  it('rejects fractional page values', () => {
    expect(paginationQuerySchema.safeParse({ page: '1.5' }).success).toBe(
      false,
    );
  });

  it('rejects page numbers above the upper bound', () => {
    expect(
      paginationQuerySchema.safeParse({ page: MAX_PAGE + 1 }).success,
    ).toBe(false);
    expect(
      paginationQuerySchema.safeParse({ page: '9000000000000' }).success,
    ).toBe(false);
  });

  it('accepts a page number exactly at the upper bound', () => {
    expect(paginationQuerySchema.safeParse({ page: MAX_PAGE }).success).toBe(
      true,
    );
  });
});
