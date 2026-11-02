Reverts the drop_base_rates migration: recreates the empty `base_rates` table with its index, foreign key and checks. The data is not restored; re-seed it from git history if needed.

```sql
CREATE TABLE "base_rates" (
    "id" UUID NOT NULL,
    "finish_level" "FinishLevel" NOT NULL,
    "area_from_sqm" DECIMAL(7,2) NOT NULL,
    "area_to_sqm" DECIMAL(7,2) NOT NULL,
    "rate_cents_per_sqm" INTEGER NOT NULL,
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "base_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "base_rates_finish_level_area_from_sqm_key" ON "base_rates"("finish_level", "area_from_sqm");

ALTER TABLE "base_rates" ADD CONSTRAINT "base_rates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "base_rates" ADD CONSTRAINT "base_rates_area_from_sqm_check" CHECK ("area_from_sqm" >= 0);
ALTER TABLE "base_rates" ADD CONSTRAINT "base_rates_area_range_check" CHECK ("area_to_sqm" > "area_from_sqm");
ALTER TABLE "base_rates" ADD CONSTRAINT "base_rates_rate_cents_per_sqm_check" CHECK ("rate_cents_per_sqm" > 0);

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102100400_drop_base_rates';
```
