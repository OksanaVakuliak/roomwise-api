import { describe, expect, it } from 'vitest';
import {
  PublicationStatus,
  RoomTypeCode,
  SurfaceKind,
} from '../../../../generated/prisma/enums';
import {
  roomTypeAdminSchema,
  roomTypeCategoryAdminSchema,
} from './room-type-admin.schema';

const baseAudit = {
  updatedAt: new Date().toISOString(),
  updatedBy: null,
};

describe('roomTypeCategoryAdminSchema', () => {
  it('accepts a draft category with an empty translation', () => {
    const result = roomTypeCategoryAdminSchema.safeParse({
      id: crypto.randomUUID(),
      name: { en: '', uk: 'Плитка' },
      status: PublicationStatus.DRAFT,
      surface: SurfaceKind.NONE,
    });

    expect(result.success).toBe(true);
  });
});

describe('roomTypeAdminSchema', () => {
  it('accepts a room type whose category is still a draft', () => {
    const result = roomTypeAdminSchema.safeParse({
      id: crypto.randomUUID(),
      code: RoomTypeCode.LIVING_ROOM,
      name: { en: 'Living room', uk: 'Вітальня' },
      categories: [
        {
          id: crypto.randomUUID(),
          name: { en: '', uk: '' },
          status: PublicationStatus.DRAFT,
          surface: SurfaceKind.NONE,
        },
      ],
      revision: crypto.randomUUID(),
      ...baseAudit,
    });

    expect(result.success).toBe(true);
  });
});
