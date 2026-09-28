import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localizedNameDraftSchema } from '../../../../common/i18n/localized-text.schema';

const MATERIAL_TYPE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
const MATERIAL_TYPE_CODE_MESSAGE =
  'Code must start with a lowercase letter and contain only lowercase letters, digits, and underscores';

export const materialTypeCodeSchema = z
  .string()
  .regex(MATERIAL_TYPE_CODE_PATTERN, MATERIAL_TYPE_CODE_MESSAGE);

export const createMaterialTypeSchema = z.object({
  code: materialTypeCodeSchema,
  name: localizedNameDraftSchema,
});

export type CreateMaterialTypeInput = z.infer<typeof createMaterialTypeSchema>;

export class CreateMaterialTypeDto extends createZodDto(
  createMaterialTypeSchema,
) {}
