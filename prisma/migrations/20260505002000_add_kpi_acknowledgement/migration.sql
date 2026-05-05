ALTER TYPE "KpiAssignmentStatus" ADD VALUE IF NOT EXISTS 'ACKNOWLEDGED';

ALTER TABLE "KpiAssignment"
ADD COLUMN IF NOT EXISTS "employeeAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "employeeAcknowledgementComment" TEXT;
