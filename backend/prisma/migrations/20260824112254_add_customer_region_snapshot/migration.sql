-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "customerCountry" VARCHAR(100),
ADD COLUMN     "customerProvince" VARCHAR(100);

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "customerCountry" VARCHAR(100),
ADD COLUMN     "customerProvince" VARCHAR(100);
