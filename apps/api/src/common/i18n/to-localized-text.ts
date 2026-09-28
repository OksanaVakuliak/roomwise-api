import type { LocalizedText } from './localized-text.schema';

export function toLocalizedText(value: unknown): LocalizedText {
  return value as LocalizedText;
}
