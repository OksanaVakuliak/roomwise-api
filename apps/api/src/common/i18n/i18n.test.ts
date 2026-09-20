import { describe, expect, it } from 'vitest';
import { AppError } from '../http/app-error';
import {
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

  it('falls back to English for absent and unknown languages', () => {
    expect(resolveLang('uk')).toBe('uk');
    expect(resolveLang('fr')).toBe('en');
    expect(resolveLang(undefined)).toBe('en');
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
    expect(() => assertTranslations(fields)).toThrow(AppError);
  });
});
