import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { postgresUrlSchema } from '../src/config/env';
import { PrismaClient } from '../src/generated/prisma/client';

const EXIT_FAILURE = 1;
const SANDBOX_STATE_ID = 1;

function readDatabaseUrl(): string {
  const result = postgresUrlSchema.safeParse(process.env.DATABASE_URL);

  if (!result.success) {
    process.stderr.write(
      'Invalid or missing DATABASE_URL environment variable.\n',
    );
    process.exit(EXIT_FAILURE);
  }

  return result.data;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    process.stderr.write(
      'Refusing to run sandbox:due against a production environment.\n',
    );
    process.exitCode = EXIT_FAILURE;
    return;
  }

  const databaseUrl = readDatabaseUrl();
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const now = new Date();

    await prisma.sandboxState.upsert({
      where: { id: SANDBOX_STATE_ID },
      update: { nextResetAt: now, lockedAt: null },
      create: { id: SANDBOX_STATE_ID, nextResetAt: now },
    });

    process.stdout.write('Sandbox reset is now due.\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const details = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to mark the sandbox reset due.\n${details}\n`);
    process.exitCode = EXIT_FAILURE;
  });
}
