Reverts the sandbox migration: drops the `sandbox_state` table.

```sql
DROP TABLE IF EXISTS "sandbox_state";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260927111047_sandbox';
```
