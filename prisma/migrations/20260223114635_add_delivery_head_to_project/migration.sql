-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "deliveryHeadId" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_deliveryHeadId_fkey" FOREIGN KEY ("deliveryHeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
