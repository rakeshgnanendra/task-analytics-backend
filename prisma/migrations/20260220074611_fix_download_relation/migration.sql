-- AlterTable
ALTER TABLE "TaskFile" ADD COLUMN     "downloadCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FileDownloadLog" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileDownloadLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileDownloadLog_fileId_idx" ON "FileDownloadLog"("fileId");

-- CreateIndex
CREATE INDEX "FileDownloadLog_userId_idx" ON "FileDownloadLog"("userId");

-- AddForeignKey
ALTER TABLE "FileDownloadLog" ADD CONSTRAINT "FileDownloadLog_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "TaskFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDownloadLog" ADD CONSTRAINT "FileDownloadLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
