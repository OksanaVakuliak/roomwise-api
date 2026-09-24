import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  resolveLang,
  SUPPORTED_LANGUAGES,
} from '../../../../common/i18n/resolve-lang';

export const langQuerySchema = z.object({
  lang: z.preprocess(resolveLang, z.enum(SUPPORTED_LANGUAGES)),
});

export type LangQuery = z.infer<typeof langQuerySchema>;

export class LangQueryDto extends createZodDto(langQuerySchema) {}
