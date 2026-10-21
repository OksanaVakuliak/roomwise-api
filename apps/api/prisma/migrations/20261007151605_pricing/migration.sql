-- CreateEnum
CREATE TYPE "FinishLevel" AS ENUM ('ROUGH', 'PRE_FINISH');

-- CreateEnum
CREATE TYPE "RuleLevel" AS ENUM ('OBJECT', 'CATEGORY', 'MATERIAL_TYPE');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('NBU', 'MANUAL');

-- CreateTable
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

-- CreateTable
CREATE TABLE "coefficients" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "unit" JSONB NOT NULL,
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "coefficients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "level" "RuleLevel" NOT NULL,
    "category_id" UUID,
    "material_type_id" UUID,
    "name" JSONB NOT NULL,
    "quantity_formula" TEXT,
    "cost_formula" TEXT NOT NULL,
    "coefficient_keys" TEXT[],
    "sort_order" INTEGER NOT NULL,
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "source" "RateSource" NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "effective_date" DATE NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_settings" (
    "id" INTEGER NOT NULL,
    "manual_rate_id" UUID,
    "last_nbu_success_date" DATE,
    "last_nbu_attempt_at" TIMESTAMPTZ(3),
    "last_nbu_error" TEXT,
    "total_area_min_sqm" DECIMAL(7,2) NOT NULL,
    "total_area_max_sqm" DECIMAL(7,2) NOT NULL,
    "rooms_min" INTEGER NOT NULL,
    "rooms_max" INTEGER NOT NULL,
    "room_side_min_m" DECIMAL(5,2) NOT NULL,
    "room_side_max_m" DECIMAL(5,2) NOT NULL,
    "room_height_min_m" DECIMAL(4,2) NOT NULL,
    "room_height_max_m" DECIMAL(4,2) NOT NULL,

    CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "base_rates_finish_level_area_from_sqm_key" ON "base_rates"("finish_level", "area_from_sqm");

-- CreateIndex
CREATE UNIQUE INDEX "coefficients_key_key" ON "coefficients"("key");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_category_id_key" ON "pricing_rules"("category_id") WHERE ("level" = 'CATEGORY');

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_category_id_material_type_id_key" ON "pricing_rules"("category_id", "material_type_id") WHERE ("level" = 'MATERIAL_TYPE');

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_source_effective_date_key" ON "exchange_rates"("source", "effective_date") WHERE ("source" = 'NBU');

-- AddForeignKey
ALTER TABLE "base_rates" ADD CONSTRAINT "base_rates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coefficients" ADD CONSTRAINT "coefficients_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_manual_rate_id_fkey" FOREIGN KEY ("manual_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheck
ALTER TABLE "base_rates" ADD CONSTRAINT "base_rates_area_from_sqm_check" CHECK ("area_from_sqm" >= 0);
ALTER TABLE "base_rates" ADD CONSTRAINT "base_rates_area_range_check" CHECK ("area_to_sqm" > "area_from_sqm");
ALTER TABLE "base_rates" ADD CONSTRAINT "base_rates_rate_cents_per_sqm_check" CHECK ("rate_cents_per_sqm" > 0);
ALTER TABLE "coefficients" ADD CONSTRAINT "coefficients_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{1,40}$');
ALTER TABLE "coefficients" ADD CONSTRAINT "coefficients_value_check" CHECK ("value" >= 0);
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_cost_formula_check" CHECK (char_length("cost_formula") <= 500);
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_level_shape_check" CHECK (
    ("level" = 'OBJECT' AND "category_id" IS NULL AND "material_type_id" IS NULL AND "quantity_formula" IS NULL)
    OR ("level" = 'CATEGORY' AND "category_id" IS NOT NULL AND "material_type_id" IS NULL AND "quantity_formula" IS NOT NULL)
    OR ("level" = 'MATERIAL_TYPE' AND "category_id" IS NOT NULL AND "material_type_id" IS NOT NULL AND "quantity_formula" IS NOT NULL)
);
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_rate_check" CHECK ("rate" > 0);
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_source_check" CHECK ("created_by_id" IS NULL OR "source" = 'MANUAL');
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_singleton_check" CHECK ("id" = 1);
