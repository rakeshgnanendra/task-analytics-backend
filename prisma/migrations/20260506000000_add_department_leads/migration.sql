ALTER TABLE "User"
ADD COLUMN "isDepartmentLead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "departmentLeadId" TEXT;

ALTER TABLE "User"
ADD CONSTRAINT "User_departmentLeadId_fkey"
FOREIGN KEY ("departmentLeadId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_departmentLeadId_idx" ON "User"("departmentLeadId");
CREATE INDEX "User_isDepartmentLead_idx" ON "User"("isDepartmentLead");
