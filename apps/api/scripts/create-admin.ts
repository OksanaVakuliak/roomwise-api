import 'dotenv/config';
import * as readline from 'node:readline';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import {
  parseLoginArg,
  USAGE_MESSAGE,
  validateCredentials,
} from '../src/modules/auth/admin-cli';
import { hashPassword } from '../src/modules/auth/password-hasher';

const EXIT_FAILURE = 1;
const SIGINT_EXIT_CODE = 130;
const PRISMA_UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

const databaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'postgres:' || protocol === 'postgresql:';
    } catch {
      return false;
    }
  }, 'Must be a PostgreSQL URL');

function readDatabaseUrl(): string {
  const result = databaseUrlSchema.safeParse(process.env.DATABASE_URL);

  if (!result.success) {
    process.stderr.write(
      'Invalid or missing DATABASE_URL environment variable.\n',
    );
    process.exit(EXIT_FAILURE);
  }

  return result.data;
}

function muteOutput(rl: readline.Interface): () => void {
  const rlInternal = rl as unknown as {
    _writeToOutput: (text: string) => void;
  };
  const original = rlInternal._writeToOutput.bind(rlInternal);
  rlInternal._writeToOutput = () => {};

  return () => {
    rlInternal._writeToOutput = original;
  };
}

function promptPassword(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.on('SIGINT', () => {
      rl.close();
      process.stdout.write('\n');
      process.exit(SIGINT_EXIT_CODE);
    });

    process.stdout.write(promptText);
    const unmute = muteOutput(rl);

    rl.question('', (answer) => {
      unmute();
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function stripTrailingNewline(value: string): string {
  return value.replace(/\r?\n$/, '');
}

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    const first = await promptPassword('Password: ');
    const second = await promptPassword('Repeat password: ');

    if (first !== second) {
      process.stderr.write('Passwords do not match.\n');
      process.exit(EXIT_FAILURE);
    }

    return first;
  }

  const raw = await readStdinAll();
  return stripTrailingNewline(raw);
}

async function createAdministrator(
  databaseUrl: string,
  login: string,
  passwordHash: string,
): Promise<boolean> {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.admin.create({
      data: { login, passwordHash, isDemo: false },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR_CODE
    ) {
      return false;
    }

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const login = parseLoginArg(process.argv.slice(2));

  if (login === undefined) {
    process.stderr.write(`${USAGE_MESSAGE}\n`);
    process.exitCode = EXIT_FAILURE;
    return;
  }

  const databaseUrl = readDatabaseUrl();
  const password = await readPassword();
  const validation = validateCredentials(login, password);

  if ('errors' in validation) {
    for (const error of validation.errors) {
      process.stderr.write(`${error}\n`);
    }
    process.exitCode = EXIT_FAILURE;
    return;
  }

  const passwordHash = await hashPassword(password);
  const created = await createAdministrator(
    databaseUrl,
    validation.login,
    passwordHash,
  );

  if (!created) {
    process.stderr.write(
      `Administrator "${validation.login}" already exists\n`,
    );
    process.exitCode = EXIT_FAILURE;
    return;
  }

  process.stdout.write(`Administrator "${validation.login}" created\n`);
}

if (require.main === module) {
  main().catch((error) => {
    const details = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to create administrator.\n${details}\n`);
    process.exitCode = EXIT_FAILURE;
  });
}
