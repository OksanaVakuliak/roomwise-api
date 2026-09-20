import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
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
});
