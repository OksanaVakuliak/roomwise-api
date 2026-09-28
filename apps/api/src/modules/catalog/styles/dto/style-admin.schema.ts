import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { auditSchema } from '../../../../common/concurrency/audit.schema';
import {
  localizedDescriptionDraftSchema,
  localizedNameDraftSchema,
} from '../../../../common/i18n/localized-text.schema';
import {
  PublicationStatus,
  RoomTypeCode,
} from '../../../../generated/prisma/enums';
import { imageRefSchema } from '../../public/dto/image-ref.schema';

export const stylePairStateSchema = z.enum([
  'FILLED',
  'EMPTY',
  'PRODUCT_UNAVAILABLE',
]);

export const stylePairAdminSchema = z.object({
  roomTypeCode: z.enum(RoomTypeCode),
  roomTypeId: z.uuid(),
  categoryId: z.uuid(),
  categoryName: localizedNameDraftSchema,
  productId: z.uuid().nullable(),
  productName: localizedNameDraftSchema.nullable(),
  state: stylePairStateSchema,
});

const styleAdminBaseSchema = z
  .object({
    id: z.uuid(),
    name: localizedNameDraftSchema,
    description: localizedDescriptionDraftSchema,
    image: imageRefSchema.nullable(),
    status: z.enum(PublicationStatus),
    sortOrder: z.number().int().nonnegative(),
    revision: z.uuid(),
  })
  .extend(auditSchema.shape);

export const styleAdminSchema = styleAdminBaseSchema.extend({
  pairs: z.array(stylePairAdminSchema),
  unfilledCount: z.number().int().nonnegative(),
  unavailableCount: z.number().int().nonnegative(),
});

export const styleAdminListItemSchema = styleAdminBaseSchema.extend({
  unfilledPairs: z.number().int().nonnegative(),
  unavailablePairs: z.number().int().nonnegative(),
});

export const styleAdminListResponseSchema = z.object({
  items: z.array(styleAdminListItemSchema),
});

export type StylePairState = z.infer<typeof stylePairStateSchema>;
export type StylePairAdmin = z.infer<typeof stylePairAdminSchema>;
export type StyleAdmin = z.infer<typeof styleAdminSchema>;
export type StyleAdminListItem = z.infer<typeof styleAdminListItemSchema>;
export type StyleAdminListResponse = z.infer<
  typeof styleAdminListResponseSchema
>;

export class StyleAdminDto extends createZodDto(styleAdminSchema) {}

export class StyleAdminListResponseDto extends createZodDto(
  styleAdminListResponseSchema,
) {}
