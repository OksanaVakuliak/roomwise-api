-- AlterTable
ALTER TABLE "options" ALTER COLUMN "price_cents" DROP NOT NULL;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "requires_putty" BOOLEAN NOT NULL DEFAULT true;

-- Data
UPDATE "options" SET "price_cents" = NULL WHERE cardinality("price_coefficient_keys") > 0;
UPDATE "categories" SET "requires_putty" = false WHERE "id" IN ('ffc93df3-13b8-440a-a0d1-9cf2bc2ed941', 'fbab82c2-ccab-4f6d-b131-7195993a5346');

-- AlterCheck
ALTER TABLE "options" ADD CONSTRAINT "options_price_source_check" CHECK (("price_cents" IS NOT NULL) <> (cardinality("price_coefficient_keys") > 0));
