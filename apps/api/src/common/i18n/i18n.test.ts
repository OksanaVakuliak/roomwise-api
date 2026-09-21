import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../http/error-codes';
import {
  LOCALIZED_DESCRIPTION_MAX_LENGTH,
  LOCALIZED_NAME_MAX_LENGTH,
  localizedDescriptionDraftSchema,
  localizedNameSchema,
} from './localized-text.schema';
import { resolveLang } from './resolve-lang';
import {
  assertTranslations,
  missingTranslationFields,
} from './translation-check';

describe('i18n helpers', () => {
  it('allows empty draft translations but requires published names', () => {
    expect(
      localizedDescriptionDraftSchema.safeParse({ en: '', uk: '' }).success,
    ).toBe(true);
    expect(
      localizedNameSchema.safeParse({ en: 'Name', uk: '  ' }).success,
    ).toBe(false);
  });

  it('accepts names up to the max length and rejects longer ones', () => {
    const atLimit = 'a'.repeat(LOCALIZED_NAME_MAX_LENGTH);
    const overLimit = 'a'.repeat(LOCALIZED_NAME_MAX_LENGTH + 1);

    expect(
      localizedNameSchema.safeParse({ en: atLimit, uk: atLimit }).success,
    ).toBe(true);
    expect(
      localizedNameSchema.safeParse({ en: overLimit, uk: atLimit }).success,
    ).toBe(false);
  });

  it('accepts descriptions up to the max length and rejects longer ones', () => {
    const atLimit = 'a'.repeat(LOCALIZED_DESCRIPTION_MAX_LENGTH);
    const overLimit = 'a'.repeat(LOCALIZED_DESCRIPTION_MAX_LENGTH + 1);

    expect(
      localizedDescriptionDraftSchema.safeParse({ en: atLimit, uk: atLimit })
        .success,
    ).toBe(true);
    expect(
      localizedDescriptionDraftSchema.safeParse({
        en: overLimit,
        uk: atLimit,
      }).success,
    ).toBe(false);
  });

  it('resolves known languages case-insensitively and falls back to English', () => {
    expect(resolveLang('uk')).toBe('uk');
    expect(resolveLang('UK')).toBe('uk');
    expect(resolveLang('en')).toBe('en');
    expect(resolveLang('fr')).toBe('en');
    expect(resolveLang(undefined)).toBe('en');
    expect(resolveLang(['en', 'uk'])).toBe('en');
  });

  it('reports exact missing translation paths', () => {
    const fields = {
      name: { en: 'Name', uk: '' },
      description: { en: '', uk: 'Опис' },
    };

    expect(missingTranslationFields(fields)).toEqual([
      'name.uk',
      'description.en',
    ]);

    try {
      assertTranslations(fields);
      throw new Error('expected assertTranslations to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: ERROR_CODES.TRANSLATION_MISSING,
        params: { fields: ['name.uk', 'description.en'] },
      });
    }
  });
});
