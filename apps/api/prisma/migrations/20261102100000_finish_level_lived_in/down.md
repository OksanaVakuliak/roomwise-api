Reverts the finish_level_lived_in migration. PostgreSQL cannot drop an enum value, so the type is recreated without `LIVED_IN`. Run only while no row uses `LIVED_IN`.

```sql
ALTER TYPE "FinishLevel" RENAME TO "FinishLevel_old";
CREATE TYPE "FinishLevel" AS ENUM ('ROUGH', 'PRE_FINISH');
ALTER TABLE "base_rates" ALTER COLUMN "finish_level" TYPE "FinishLevel" USING "finish_level"::text::"FinishLevel";
DROP TYPE "FinishLevel_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102100000_finish_level_lived_in';
```

If `base_rates` is already dropped, skip the `ALTER TABLE` line.
