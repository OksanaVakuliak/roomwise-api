import { Client } from 'pg';
import { beforeAll } from 'vitest';

const SANDBOX_RESET_NEVER = '9999-12-31T00:00:00.000Z';

async function resetDatabase(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`,
    );

    if (rows.length === 0) {
      return;
    }

    const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    await client.query(
      'INSERT INTO sandbox_state (id, next_reset_at) VALUES (1, $1)',
      [SANDBOX_RESET_NEVER],
    );
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await resetDatabase();
});
