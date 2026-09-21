export const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const DEFAULT_LANGUAGE: Language = 'en';

export function resolveLang(value: unknown): Language {
  if (typeof value !== 'string') {
    return DEFAULT_LANGUAGE;
  }

  const normalized = value.toLowerCase();

  return (SUPPORTED_LANGUAGES as readonly string[]).includes(normalized)
    ? (normalized as Language)
    : DEFAULT_LANGUAGE;
}
