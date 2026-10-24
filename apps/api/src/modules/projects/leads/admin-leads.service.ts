import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { staleRevisionError } from '../../../common/concurrency/revision';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { Language } from '../../../common/i18n/resolve-lang';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { LeadStatus, Locale } from '../../../generated/prisma/enums';
import type { AuthenticatedAdmin } from '../../auth/current-admin.decorator';
import { CalculationsService } from '../calculations/calculations.service';
import type {
  AddLeadNoteInput,
  ChangeLeadStatusInput,
  LeadAdmin,
  LeadListItem,
  LeadListQuery,
  LeadListResponse,
  LeadNote,
} from './dto/admin-lead.schema';
import { maskEmail, maskName, maskPhone } from './lead-masking';

const DEFAULT_LANGUAGE: Language = 'en';

const LANGUAGE_BY_LOCALE: Record<Locale, Language> = {
  [Locale.EN]: 'en',
  [Locale.UK]: 'uk',
};

const ADMIN_REF_SELECT = { select: { id: true, login: true } } as const;

const LIST_SELECT = {
  id: true,
  number: true,
  createdAt: true,
  status: true,
  name: true,
  phone: true,
  email: true,
  expiredAtSubmission: true,
  calculationVersion: { select: { totalUsdCents: true } },
} satisfies Prisma.LeadSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  comment: true,
  consentText: true,
  consentAt: true,
  locale: true,
  revision: true,
  calculationVersion: {
    select: {
      number: true,
      totalUsdCents: true,
      calculation: { select: { publicId: true } },
    },
  },
  statusChanges: {
    orderBy: { changedAt: 'asc' },
    select: {
      fromStatus: true,
      toStatus: true,
      changedAt: true,
      changedBy: ADMIN_REF_SELECT,
    },
  },
  notes: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      text: true,
      createdAt: true,
      author: ADMIN_REF_SELECT,
    },
  },
} satisfies Prisma.LeadSelect;

type ListRow = Prisma.LeadGetPayload<{ select: typeof LIST_SELECT }>;

function listItemOf(row: ListRow, masked: boolean): LeadListItem {
  return {
    id: row.id,
    number: row.number,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    name: masked ? maskName(row.name) : row.name,
    phone: masked ? maskPhone(row.phone) : row.phone,
    email: masked ? maskEmail(row.email) : row.email,
    expiredAtSubmission: row.expiredAtSubmission,
    totalUsdCents: row.calculationVersion.totalUsdCents,
    masked,
  };
}

@Injectable()
export class AdminLeadsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CalculationsService)
    private readonly calculations: CalculationsService,
  ) {}

  async list(
    query: LeadListQuery,
    admin: Pick<AuthenticatedAdmin, 'isDemo'>,
  ): Promise<LeadListResponse> {
    const where: Prisma.LeadWhereInput = query.status
      ? { status: query.status }
      : { status: { not: LeadStatus.SPAM } };

    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      items: rows.map((row) => listItemOf(row, admin.isDemo)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(
    id: string,
    lang: Language,
    admin: Pick<AuthenticatedAdmin, 'isDemo'>,
  ): Promise<LeadAdmin> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });

    if (!lead) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const masked = admin.isDemo;
    const calculation = await this.calculations.findVersion(
      lead.calculationVersion.calculation.publicId,
      lead.calculationVersion.number,
      lang,
    );

    return {
      ...listItemOf(lead, masked),
      comment: masked ? null : lead.comment,
      consentText: masked ? null : lead.consentText,
      consentAt: lead.consentAt.toISOString(),
      locale: LANGUAGE_BY_LOCALE[lead.locale],
      revision: lead.revision,
      statusHistory: lead.statusChanges.map((change) => ({
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        changedAt: change.changedAt.toISOString(),
        changedBy: change.changedBy,
      })),
      notes: lead.notes.map((note) => ({
        id: note.id,
        text: masked ? null : note.text,
        createdAt: note.createdAt.toISOString(),
        author: note.author,
      })),
      calculation,
    };
  }

  async changeStatus(
    id: string,
    input: ChangeLeadStatusInput,
    admin: AuthenticatedAdmin,
    lang: Language = DEFAULT_LANGUAGE,
  ): Promise<LeadAdmin> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.lead.findUnique({
        where: { id },
        select: { status: true, revision: true },
      });

      if (!current) {
        throw new AppError(ERROR_CODES.NOT_FOUND);
      }
      if (current.revision !== input.revision) {
        throw staleRevisionError(current.revision);
      }
      if (current.status === input.status) {
        throw new AppError(ERROR_CODES.SAME_STATUS);
      }

      const { count } = await tx.lead.updateMany({
        where: { id, revision: input.revision },
        data: { status: input.status, revision: randomUUID() },
      });

      if (count === 0) {
        const latest = await tx.lead.findUnique({
          where: { id },
          select: { revision: true },
        });
        if (!latest) {
          throw new AppError(ERROR_CODES.NOT_FOUND);
        }
        throw staleRevisionError(latest.revision);
      }

      await tx.leadStatusChange.create({
        data: {
          leadId: id,
          fromStatus: current.status,
          toStatus: input.status,
          changedById: admin.id,
        },
      });
    });

    return this.get(id, lang, admin);
  }

  async addNote(
    id: string,
    input: AddLeadNoteInput,
    admin: AuthenticatedAdmin,
  ): Promise<LeadNote> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!lead) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const note = await this.prisma.leadNote.create({
      data: { leadId: id, text: input.text, authorId: admin.id },
      select: { id: true, text: true, createdAt: true },
    });

    return {
      id: note.id,
      text: note.text,
      createdAt: note.createdAt.toISOString(),
      author: { id: admin.id, login: admin.login },
    };
  }

  async delete(id: string): Promise<void> {
    const { count } = await this.prisma.lead.deleteMany({ where: { id } });

    if (count === 0) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }
  }
}
