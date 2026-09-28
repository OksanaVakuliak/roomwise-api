import type { PrismaClient } from '../../src/generated/prisma/client';
import { hashPassword } from '../../src/modules/auth/password-hasher';

export interface DemoAdminSeedParams {
  login: string;
  password: string;
}

export interface AdminSeedRow {
  id: string;
}

export type AdminSeedAction =
  | { kind: 'update'; adminId: string }
  | { kind: 'create' }
  | { kind: 'conflict' };

export function resolveAdminSeedAction(
  existingDemoAdmin: AdminSeedRow | null,
  adminWithLogin: AdminSeedRow | null,
): AdminSeedAction {
  const conflicting =
    adminWithLogin !== null && adminWithLogin.id !== existingDemoAdmin?.id;

  if (conflicting) {
    return { kind: 'conflict' };
  }
  if (existingDemoAdmin) {
    return { kind: 'update', adminId: existingDemoAdmin.id };
  }
  return { kind: 'create' };
}

export async function seedDemoAdmin(
  prisma: PrismaClient,
  { login, password }: DemoAdminSeedParams,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  const existingDemoAdmin = await prisma.admin.findUnique({
    where: { isDemo: true },
    select: { id: true },
  });
  const adminWithLogin = await prisma.admin.findUnique({
    where: { login },
    select: { id: true },
  });

  const action = resolveAdminSeedAction(existingDemoAdmin, adminWithLogin);

  if (action.kind === 'conflict') {
    throw new Error(
      `Cannot seed demo admin: login "${login}" already belongs to a non-demo administrator.`,
    );
  }

  if (action.kind === 'update') {
    await prisma.admin.update({
      where: { id: action.adminId },
      data: { login, passwordHash },
    });
    return;
  }

  await prisma.admin.create({
    data: { login, passwordHash, isDemo: true },
  });
}
