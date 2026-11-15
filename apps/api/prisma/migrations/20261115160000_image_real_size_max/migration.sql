-- CheckConstraint
ALTER TABLE "images" DROP CONSTRAINT "images_real_size_mm_check";
ALTER TABLE "images" ADD CONSTRAINT "images_real_size_mm_check" CHECK ("real_size_mm" IS NULL OR "real_size_mm" BETWEEN 1 AND 10000);
