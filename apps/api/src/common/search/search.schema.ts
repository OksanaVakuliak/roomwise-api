import { z } from 'zod';

export const SEARCH_TERM_MAX = 100;

export const searchTermSchema = z.string().trim().min(1).max(SEARCH_TERM_MAX);

export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}
