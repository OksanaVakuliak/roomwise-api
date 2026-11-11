-- AlterTable
ALTER TABLE "images" ADD COLUMN "real_size_mm" INTEGER;

-- CheckConstraint
ALTER TABLE "images" ADD CONSTRAINT "images_real_size_mm_check" CHECK ("real_size_mm" IS NULL OR "real_size_mm" > 0);
