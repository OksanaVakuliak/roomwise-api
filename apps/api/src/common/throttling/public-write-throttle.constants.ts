export const PUBLIC_WRITE_LIMITS_PER_HOUR = { saves: 20, leads: 5 } as const;

export type PublicWriteLimitName = keyof typeof PUBLIC_WRITE_LIMITS_PER_HOUR;
