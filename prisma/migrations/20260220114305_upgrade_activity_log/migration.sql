/*
  Warnings:

  - You are about to drop the column `taskId` on the `ActivityLog` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ActivityLog` table. All the data in the column will be lost.
  - Added the required column `entityId` to the `ActivityLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityType` to the `ActivityLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `performedBy` to the `ActivityLog` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `action` on the `ActivityLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_taskId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_userId_fkey";

-- DropIndex
DROP INDEX "ActivityLog_taskId_idx";

-- DropIndex
DROP INDEX "ActivityLog_userId_idx";

-- AlterTable
ALTER TABLE "ActivityLog" DROP COLUMN "taskId",
DROP COLUMN "userId",
ADD COLUMN     "entityId" TEXT NOT NULL,
ADD COLUMN     "entityType" TEXT NOT NULL,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "performedBy" TEXT NOT NULL,
DROP COLUMN "action",
ADD COLUMN     "action" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_idx" ON "ActivityLog"("entityType");

-- CreateIndex
CREATE INDEX "ActivityLog_entityId_idx" ON "ActivityLog"("entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_performedBy_idx" ON "ActivityLog"("performedBy");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
