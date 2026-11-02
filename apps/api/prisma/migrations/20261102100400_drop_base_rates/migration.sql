-- DropForeignKey
ALTER TABLE "base_rates" DROP CONSTRAINT "base_rates_updated_by_id_fkey";

-- DropTable
DROP TABLE "base_rates";
