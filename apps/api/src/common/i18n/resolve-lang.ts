export const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function resolveLang(value: unknown): Language {
  return value === 'uk' ? 'uk' : 'en';
}
