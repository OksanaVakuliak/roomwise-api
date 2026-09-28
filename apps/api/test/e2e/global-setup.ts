import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { resolveTestDatabaseUrls } from '../test-database-url';

const TEST_DATABASE_SUFFIX = '_test';

function assertTestDatabase(url: string, label: string): void {
  const databaseName = new URL(url).pathname.replace(/^\//, '');

  if (!databaseName.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `${label} does not point at a test database (expected a name ending with "${TEST_DATABASE_SUFFIX}", got "${databaseName}"). Refusing to run e2e migrations.`,
    );
  }
}

export function setup(): void {
  const { databaseUrl, directUrl } = resolveTestDatabaseUrls();

  assertTestDatabase(databaseUrl, 'DATABASE_URL');
  assertTestDatabase(directUrl, 'DIRECT_URL');

  const apiRoot = resolve(__dirname, '..', '..');
  const prismaBin = resolve(
    apiRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.CMD' : 'prisma',
  );

  execFileSync(
    prismaBin,
    ['migrate', 'deploy', '--config', 'prisma.config.ts'],
    {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
}
