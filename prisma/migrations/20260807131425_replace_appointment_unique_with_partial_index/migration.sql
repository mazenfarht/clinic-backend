-- DropIndex
DROP INDEX "appointments_clinicId_appointmentDate_appointmentTime_key";

-- CreateIndex
CREATE INDEX "appointments_clinicId_appointmentDate_appointmentTime_idx" ON "appointments"("clinicId", "appointmentDate", "appointmentTime");

-- CreatePartialUniqueIndex
-- Enforces uniqueness only for active appointments (SCHEDULED, CONFIRMED).
-- CANCELLED and NO_SHOW rows are excluded, releasing their time slot for rebooking.
-- This index is managed manually and must not be replaced by Prisma's @@unique directive.
CREATE UNIQUE INDEX "appointments_clinicId_appointmentDate_appointmentTime_active_key"
  ON "appointments"("clinicId", "appointmentDate", "appointmentTime")
  WHERE status IN ('SCHEDULED', 'CONFIRMED');