import { AppError } from '../http/app-error';
import { ERROR_CODES } from '../http/error-codes';
import type { LocalizedText } from './localized-text.schema';
import { SUPPORTED_LANGUAGES } from './resolve-lang';

export function missingTranslationFields(
  fields: Record<string, LocalizedText>,
): string[] {
  return Object.entries(fields).flatMap(([field, text]) =>
    SUPPORTED_LANGUAGES.filter((language) => !text[language].trim()).map(
      (language) => `${field}.${language}`,
    ),
  );
}

export function assertTranslations(
  fields: Record<string, LocalizedText>,
): void {
  const missing = missingTranslationFields(fields);

  if (missing.length > 0) {
    throw new AppError(ERROR_CODES.TRANSLATION_MISSING, {
      params: { fields: missing },
    });
  }
}
