import { z } from 'zod';

export const LOCALIZED_NAME_MAX_LENGTH = 120;
export const LOCALIZED_DESCRIPTION_MAX_LENGTH = 2000;

function localizedTextSchema(maxLength: number, requireText: boolean) {
  const valueSchema = z
    .string()
    .max(maxLength)
    .refine(
      (value) => !requireText || value.trim().length > 0,
      'Translation is required',
    );

  return z.object({
    en: valueSchema,
    uk: valueSchema,
  });
}

export const localizedNameDraftSchema = localizedTextSchema(
  LOCALIZED_NAME_MAX_LENGTH,
  false,
);
export const localizedNameSchema = localizedTextSchema(
  LOCALIZED_NAME_MAX_LENGTH,
  true,
);
export const localizedDescriptionDraftSchema = localizedTextSchema(
  LOCALIZED_DESCRIPTION_MAX_LENGTH,
  false,
);
export const localizedDescriptionSchema = localizedTextSchema(
  LOCALIZED_DESCRIPTION_MAX_LENGTH,
  true,
);

export type LocalizedText = z.infer<typeof localizedNameDraftSchema>;
