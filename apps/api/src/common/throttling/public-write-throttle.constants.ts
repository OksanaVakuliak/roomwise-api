export const SAVES_PER_HOUR = 20;
export const LEADS_PER_HOUR = 5;

export const PUBLIC_WRITE_LIMIT_NAMES = ['saves', 'leads'] as const;

export type PublicWriteLimitName = (typeof PUBLIC_WRITE_LIMIT_NAMES)[number];
