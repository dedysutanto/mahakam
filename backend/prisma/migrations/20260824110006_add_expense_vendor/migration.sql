-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "vendorId" TEXT;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
