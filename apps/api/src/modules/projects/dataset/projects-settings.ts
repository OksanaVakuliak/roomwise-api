import type { LocalizedText } from '../../../common/i18n/localized-text.schema';

export const PROJECTS_SETTINGS_ID = 1;

export const projectsSettingsDataset: {
  calculationValidityDays: number;
  leadRetentionDays: number;
  leadFormNotice: LocalizedText;
} = {
  calculationValidityDays: 14,
  leadRetentionDays: 30,
  leadFormNotice: {
    en: 'We keep your request for {days} days, then delete it automatically.',
    uk: 'Ми зберігаємо вашу заявку {days} днів, після чого вона автоматично видаляється.',
  },
};
