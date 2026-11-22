import { describe, expect, it } from 'vitest';
import {
  containsPattern,
  SEARCH_TERM_MAX,
  searchTermSchema,
} from './search.schema';

describe('searchTermSchema', () => {
  it('trims the term', () => {
    expect(searchTermSchema.parse('  tile  ')).toBe('tile');
  });

  it('rejects empty and whitespace-only terms', () => {
    expect(searchTermSchema.safeParse('').success).toBe(false);
    expect(searchTermSchema.safeParse('   ').success).toBe(false);
  });

  it('accepts the maximum length and rejects one more', () => {
    expect(
      searchTermSchema.safeParse('a'.repeat(SEARCH_TERM_MAX)).success,
    ).toBe(true);
    expect(
      searchTermSchema.safeParse('a'.repeat(SEARCH_TERM_MAX + 1)).success,
    ).toBe(false);
  });
});

describe('containsPattern', () => {
  it('wraps the term in wildcards', () => {
    expect(containsPattern('tile')).toBe('%tile%');
  });

  it('escapes LIKE wildcards and the escape character', () => {
    expect(containsPattern('50%_\\')).toBe('%50\\%\\_\\\\%');
  });
});
