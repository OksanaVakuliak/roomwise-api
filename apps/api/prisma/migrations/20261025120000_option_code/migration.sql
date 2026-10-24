-- CreateEnum
CREATE TYPE "OptionCode" AS ENUM ('HEATED_FLOOR');

-- AlterTable
ALTER TABLE "options" ADD COLUMN     "code" "OptionCode";

-- CreateIndex
CREATE UNIQUE INDEX "options_code_key" ON "options"("code");

-- Backfill
UPDATE "options" SET "code" = 'HEATED_FLOOR' WHERE "id" = 'd063df67-2423-4c0d-8aef-ec20a55f8919';
