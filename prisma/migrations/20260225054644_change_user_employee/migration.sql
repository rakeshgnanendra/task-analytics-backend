/*
  Warnings:

  - The values [USER] on the enum `GlobalRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "GlobalRole_new" AS ENUM ('SUPER_ADMIN', 'DELIVERY_HEAD', 'Employee');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "GlobalRole_new" USING ("role"::text::"GlobalRole_new");
ALTER TYPE "GlobalRole" RENAME TO "GlobalRole_old";
ALTER TYPE "GlobalRole_new" RENAME TO "GlobalRole";
DROP TYPE "GlobalRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'Employee';
COMMIT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'Employee';
