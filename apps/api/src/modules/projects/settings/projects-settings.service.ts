import { Inject, Injectable } from '@nestjs/common';
import { updateWithRevision } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { PROJECTS_SETTINGS_ID } from '../dataset/projects-settings';
import type {
  PatchProjectsSettingsInput,
  ProjectsSettingsAdmin,
} from './dto/projects-settings.schema';

const DAYS_PLACEHOLDER = '{days}';

const ADMIN_INCLUDE = {
  updatedBy: { select: { id: true, login: true } },
} satisfies Prisma.ProjectsSettingsInclude;

export interface ProjectsSettings {
  calculationValidityDays: number;
  leadRetentionDays: number;
  leadFormNotice: LocalizedText;
  lastRetentionRunAt: Date | null;
  revision: string;
  updatedAt: Date;
  updatedById: string | null;
}

@Injectable()
export class ProjectsSettingsService {
  private cached: ProjectsSettings | null = null;
  private pending: Promise<ProjectsSettings> | null = null;
  private generation = 0;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  invalidate(): void {
    this.generation += 1;
    this.cached = null;
    this.pending = null;
  }

  async get(): Promise<ProjectsSettings> {
    if (this.cached) {
      return this.cached;
    }

    if (!this.pending) {
      const generation = this.generation;
      const pending = this.read().then((settings) => {
        if (generation === this.generation) {
          this.cached = settings;
          this.pending = null;
        }
        return settings;
      });
      pending.catch(() => {
        if (this.pending === pending) {
          this.pending = null;
        }
      });
      this.pending = pending;
    }

    return this.pending;
  }

  async getAdmin(): Promise<ProjectsSettingsAdmin> {
    const row = await this.prisma.projectsSettings.findUnique({
      where: { id: PROJECTS_SETTINGS_ID },
      include: ADMIN_INCLUDE,
    });

    if (!row) {
      throw new Error('Projects settings are missing; run the seed.');
    }

    return {
      calculationValidityDays: row.calculationValidityDays,
      leadRetentionDays: row.leadRetentionDays,
      leadFormNotice: toLocalizedText(row.leadFormNotice),
      lastRetentionRunAt: row.lastRetentionRunAt?.toISOString() ?? null,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  async update(
    input: PatchProjectsSettingsInput,
    adminId: string,
  ): Promise<ProjectsSettingsAdmin> {
    const { leadFormNotice } = input;

    if (leadFormNotice) {
      const missing = (['en', 'uk'] as const).filter(
        (language) => !leadFormNotice[language].includes(DAYS_PLACEHOLDER),
      );

      if (missing.length > 0) {
        throw new AppError(ERROR_CODES.NOTICE_PLACEHOLDER_MISSING, {
          params: { placeholder: DAYS_PLACEHOLDER, languages: missing },
        });
      }
    }

    await updateWithRevision({
      id: String(PROJECTS_SETTINGS_ID),
      expectedRevision: input.revision,
      updatedById: adminId,
      update: async ({ expectedRevision, mutation }) => {
        const result = await this.prisma.projectsSettings.updateMany({
          where: { id: PROJECTS_SETTINGS_ID, revision: expectedRevision },
          data: {
            ...(input.calculationValidityDays !== undefined
              ? { calculationValidityDays: input.calculationValidityDays }
              : {}),
            ...(input.leadRetentionDays !== undefined
              ? { leadRetentionDays: input.leadRetentionDays }
              : {}),
            ...(leadFormNotice !== undefined ? { leadFormNotice } : {}),
            revision: mutation.revision,
            updatedAt: mutation.updatedAt,
            updatedById: mutation.updatedById,
          },
        });

        return result.count;
      },
      readCurrentRevision: async () => {
        const current = await this.prisma.projectsSettings.findUnique({
          where: { id: PROJECTS_SETTINGS_ID },
          select: { revision: true },
        });

        return current?.revision ?? null;
      },
    });

    this.invalidate();

    return this.getAdmin();
  }

  private async read(): Promise<ProjectsSettings> {
    const row = await this.prisma.projectsSettings.findUnique({
      where: { id: PROJECTS_SETTINGS_ID },
    });

    if (!row) {
      throw new Error('Projects settings are missing; run the seed.');
    }

    const { id: _id, ...settings } = row;

    return {
      ...settings,
      leadFormNotice: toLocalizedText(row.leadFormNotice),
    };
  }
}
