-- Add HR as a global role for KPI ownership.
ALTER TYPE "GlobalRole" ADD VALUE IF NOT EXISTS 'HR';

-- KPI enums.
DO $$ BEGIN
  CREATE TYPE "KpiCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REVIEW_OPEN', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "KpiAssignmentStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'REVIEW_OPEN', 'REVIEWED', 'FINALIZED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "KpiReviewPhase" AS ENUM ('PLANNING', 'MID_YEAR', 'FINAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- User profile addition.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "designation" TEXT;

-- Task KPI linkage fields.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isKpiLinked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "kpiCategory" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "kpiWeight" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "kpiAssignmentItemId" TEXT;

-- KPI cycle.
CREATE TABLE IF NOT EXISTS "KpiCycle" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "managerReviewStart" TIMESTAMP(3),
  "managerReviewEnd" TIMESTAMP(3),
  "status" "KpiCycleStatus" NOT NULL DEFAULT 'DRAFT',
  "releaseToEmployees" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KpiCycle_pkey" PRIMARY KEY ("id")
);

-- KPI template.
CREATE TABLE IF NOT EXISTS "KpiTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "GlobalRole",
  "designation" TEXT,
  "departmentId" TEXT,
  "createdById" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KpiTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KpiTemplateItem" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "measure" TEXT,
  "weight" DOUBLE PRECISION NOT NULL,
  "taskLinked" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "KpiTemplateItem_pkey" PRIMARY KEY ("id")
);

-- Employee assignment.
CREATE TABLE IF NOT EXISTS "KpiAssignment" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "templateId" TEXT,
  "managerId" TEXT,
  "status" "KpiAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
  "autoScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "managerAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "managerFinalComments" TEXT,
  "employeeComments" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KpiAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KpiAssignmentItem" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "templateItemId" TEXT,
  "category" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "measure" TEXT,
  "weight" DOUBLE PRECISION NOT NULL,
  "taskLinked" BOOLEAN NOT NULL DEFAULT true,
  "completionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "onTimeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "productivityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "managerScore" DOUBLE PRECISION,
  "managerComments" TEXT,
  CONSTRAINT "KpiAssignmentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KpiFeedback" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "phase" "KpiReviewPhase" NOT NULL,
  "rating" TEXT,
  "comment" TEXT NOT NULL,
  "adjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KpiFeedback_pkey" PRIMARY KEY ("id")
);

-- Indexes.
CREATE UNIQUE INDEX IF NOT EXISTS "KpiCycle_financialYear_key" ON "KpiCycle"("financialYear");
CREATE INDEX IF NOT EXISTS "KpiCycle_status_idx" ON "KpiCycle"("status");
CREATE INDEX IF NOT EXISTS "KpiTemplate_role_idx" ON "KpiTemplate"("role");
CREATE INDEX IF NOT EXISTS "KpiTemplate_designation_idx" ON "KpiTemplate"("designation");
CREATE INDEX IF NOT EXISTS "KpiTemplate_departmentId_idx" ON "KpiTemplate"("departmentId");
CREATE INDEX IF NOT EXISTS "KpiTemplateItem_templateId_idx" ON "KpiTemplateItem"("templateId");
CREATE UNIQUE INDEX IF NOT EXISTS "KpiAssignment_cycleId_employeeId_key" ON "KpiAssignment"("cycleId", "employeeId");
CREATE INDEX IF NOT EXISTS "KpiAssignment_employeeId_idx" ON "KpiAssignment"("employeeId");
CREATE INDEX IF NOT EXISTS "KpiAssignment_managerId_idx" ON "KpiAssignment"("managerId");
CREATE INDEX IF NOT EXISTS "KpiAssignment_status_idx" ON "KpiAssignment"("status");
CREATE INDEX IF NOT EXISTS "KpiAssignmentItem_assignmentId_idx" ON "KpiAssignmentItem"("assignmentId");
CREATE INDEX IF NOT EXISTS "KpiAssignmentItem_templateItemId_idx" ON "KpiAssignmentItem"("templateItemId");
CREATE INDEX IF NOT EXISTS "KpiAssignmentItem_category_idx" ON "KpiAssignmentItem"("category");
CREATE INDEX IF NOT EXISTS "KpiFeedback_assignmentId_idx" ON "KpiFeedback"("assignmentId");
CREATE INDEX IF NOT EXISTS "KpiFeedback_reviewerId_idx" ON "KpiFeedback"("reviewerId");
CREATE INDEX IF NOT EXISTS "KpiFeedback_phase_idx" ON "KpiFeedback"("phase");
CREATE INDEX IF NOT EXISTS "Task_kpiAssignmentItemId_idx" ON "Task"("kpiAssignmentItemId");

-- Foreign keys.
ALTER TABLE "KpiTemplate" ADD CONSTRAINT "KpiTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KpiTemplate" ADD CONSTRAINT "KpiTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KpiTemplateItem" ADD CONSTRAINT "KpiTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KpiTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KpiAssignment" ADD CONSTRAINT "KpiAssignment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "KpiCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KpiAssignment" ADD CONSTRAINT "KpiAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KpiAssignment" ADD CONSTRAINT "KpiAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KpiTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KpiAssignment" ADD CONSTRAINT "KpiAssignment_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KpiAssignmentItem" ADD CONSTRAINT "KpiAssignmentItem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "KpiAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KpiAssignmentItem" ADD CONSTRAINT "KpiAssignmentItem_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "KpiTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_kpiAssignmentItemId_fkey" FOREIGN KEY ("kpiAssignmentItemId") REFERENCES "KpiAssignmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KpiFeedback" ADD CONSTRAINT "KpiFeedback_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "KpiAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KpiFeedback" ADD CONSTRAINT "KpiFeedback_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
