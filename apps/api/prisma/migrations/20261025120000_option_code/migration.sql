-- CreateEnum
CREATE TYPE "OptionCode" AS ENUM ('HEATED_FLOOR');

-- AlterTable
ALTER TABLE "options" ADD COLUMN     "code" "OptionCode";

-- CreateIndex
CREATE UNIQUE INDEX "options_code_key" ON "options"("code");
