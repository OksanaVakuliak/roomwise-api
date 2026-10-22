import { Inject, Injectable } from '@nestjs/common';
import type { LocalizedText } from '../../../common/i18n/localized-text.schema';
import { toLocalizedText } from '../../../common/i18n/to-localized-text';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PROJECTS_SETTINGS_ID } from '../dataset/projects-settings';

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
