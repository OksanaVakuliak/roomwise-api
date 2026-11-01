-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "CoefficientGroup" AS ENUM ('LABOR', 'PREPARATION', 'ROUGH_MATERIAL', 'ENGINEERING', 'MATERIAL_EXTRA');

-- AlterTable
ALTER TABLE "coefficients" ADD COLUMN     "group" "CoefficientGroup" NOT NULL DEFAULT 'MATERIAL_EXTRA';

-- AlterTable
ALTER TABLE "options" ADD COLUMN     "price_coefficient_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scopes" "Scope"[] DEFAULT ARRAY['FULL', 'PARTIAL']::"Scope"[];

-- AlterTable
ALTER TABLE "pricing_rules" ADD COLUMN     "base_component" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "labor_formula" TEXT,
ADD COLUMN     "surface" "SurfaceKind";

-- AlterTable
ALTER TABLE "pricing_settings" ADD COLUMN     "missing_area_hint_sqm" DECIMAL(7,2) NOT NULL DEFAULT 5;

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_surface_key" ON "pricing_rules"("surface") WHERE ("level" = 'SURFACE');
