Reverts the option_code migration: drops the unique index, the code column and its enum.

```sql
DROP INDEX IF EXISTS "options_code_key";
ALTER TABLE "options" DROP COLUMN IF EXISTS "code";
DROP TYPE IF EXISTS "OptionCode";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261025120000_option_code';
```
