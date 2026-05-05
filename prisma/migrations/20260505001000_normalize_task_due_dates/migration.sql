-- Date-only task due dates were stored at UTC midnight, which makes same-day tasks look overdue.
-- Move midnight due dates to end-of-day IST (23:59:59.999 IST = 18:29:59.999 UTC).
UPDATE "Task"
SET "dueDate" = date_trunc('day', "dueDate") + interval '18 hours 29 minutes 59.999 seconds'
WHERE "dueDate" = date_trunc('day', "dueDate");
