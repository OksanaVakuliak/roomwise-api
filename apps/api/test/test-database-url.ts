const DEFAULT_DATABASE_URL =
  'postgresql://roomwise:roomwise@localhost:5432/roomwise_test';
const DEFAULT_DIRECT_URL = DEFAULT_DATABASE_URL;

export interface TestDatabaseUrls {
  databaseUrl: string;
  directUrl: string;
}

export function resolveTestDatabaseUrls(): TestDatabaseUrls {
  return {
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    directUrl: process.env.DIRECT_URL ?? DEFAULT_DIRECT_URL,
  };
}
