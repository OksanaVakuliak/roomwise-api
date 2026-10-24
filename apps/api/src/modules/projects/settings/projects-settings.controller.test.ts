import { describe, expect, it, vi } from 'vitest';
import {
  patchProjectsSettingsSchema,
  projectsSettingsAdminSchema,
} from './dto/projects-settings.schema';
import { ProjectsSettingsController } from './projects-settings.controller';
import type { ProjectsSettingsService } from './projects-settings.service';

const revision = '7c1d6a8e-5b0e-4c7e-9a52-2f6f4e1b7a10';
const notice = { en: 'Kept for {days} days', uk: 'Зберігаємо {days} днів' };

describe('ProjectsSettingsController', () => {
  it('delegates get to getAdmin', async () => {
    const view = { revision };
    const service = {
      getAdmin: vi.fn().mockResolvedValue(view),
    } as unknown as ProjectsSettingsService;

    const result = await new ProjectsSettingsController(service).get();

    expect(result).toBe(view);
  });

  it('passes the body and the admin id to update', async () => {
    const view = { revision };
    const update = vi.fn().mockResolvedValue(view);
    const service = { update } as unknown as ProjectsSettingsService;
    const body = { leadRetentionDays: 10, revision };

    const result = await new ProjectsSettingsController(service).update(body, {
      id: 'admin-1',
    } as never);

    expect(update).toHaveBeenCalledWith(body, 'admin-1');
    expect(result).toBe(view);
  });
});

describe('patchProjectsSettingsSchema', () => {
  it('accepts a partial body with a revision', () => {
    expect(
      patchProjectsSettingsSchema.safeParse({
        calculationValidityDays: 365,
        leadFormNotice: notice,
        revision,
      }).success,
    ).toBe(true);
  });

  it('accepts a body with only a revision', () => {
    expect(patchProjectsSettingsSchema.safeParse({ revision }).success).toBe(
      true,
    );
  });

  it.each([0, 366, 1.5, '7'])('rejects days of %s', (days) => {
    expect(
      patchProjectsSettingsSchema.safeParse({
        calculationValidityDays: days,
        revision,
      }).success,
    ).toBe(false);
    expect(
      patchProjectsSettingsSchema.safeParse({
        leadRetentionDays: days,
        revision,
      }).success,
    ).toBe(false);
  });

  it('rejects a missing revision and unknown keys', () => {
    expect(patchProjectsSettingsSchema.safeParse({}).success).toBe(false);
    expect(
      patchProjectsSettingsSchema.safeParse({ revision, extra: 1 }).success,
    ).toBe(false);
  });

  it('rejects a notice without a translation', () => {
    expect(
      patchProjectsSettingsSchema.safeParse({
        leadFormNotice: { en: 'x {days}', uk: ' ' },
        revision,
      }).success,
    ).toBe(false);
  });
});

describe('projectsSettingsAdminSchema', () => {
  it('accepts the admin view with and without an editor', () => {
    const view = {
      calculationValidityDays: 14,
      leadRetentionDays: 30,
      leadFormNotice: notice,
      lastRetentionRunAt: null,
      revision,
      updatedAt: '2026-10-01T00:00:00.000Z',
      updatedBy: null,
    };

    expect(projectsSettingsAdminSchema.safeParse(view).success).toBe(true);
    expect(
      projectsSettingsAdminSchema.safeParse({
        ...view,
        updatedBy: { id: revision, login: 'admin' },
      }).success,
    ).toBe(true);
  });
});
