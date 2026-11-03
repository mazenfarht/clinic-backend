-- Multi-doctor support -------------------------------------------------------

-- CreateTable
CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "bio" TEXT,
    "appointmentDuration" INTEGER,
    "workingHours" JSONB,
    "isBookable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctors_userId_key" ON "doctors"("userId");
CREATE INDEX "doctors_clinicId_isBookable_idx" ON "doctors"("clinicId", "isBookable");

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing DOCTOR user gets a profile
INSERT INTO "doctors" ("id", "clinicId", "userId", "specialty", "updatedAt")
SELECT gen_random_uuid()::text, u."clinicId", u."id", 'General Practice', CURRENT_TIMESTAMP
FROM "users" u
WHERE u."role" = 'DOCTOR';

-- Appointments get a doctor
ALTER TABLE "appointments" ADD COLUMN "doctorId" TEXT;

-- Backfill: before this migration a clinic had ONE schedule, so assign all
-- existing appointments to the clinic's earliest-created doctor.
UPDATE "appointments" a
SET "doctorId" = (
  SELECT d."id" FROM "doctors" d
  WHERE d."clinicId" = a."clinicId"
  ORDER BY d."createdAt" ASC, d."id" ASC
  LIMIT 1
)
WHERE a."doctorId" IS NULL;

CREATE INDEX "appointments_doctorId_appointmentDate_idx"
  ON "appointments"("doctorId", "appointmentDate");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Slot uniqueness is now PER DOCTOR (partial index, managed manually — see schema note)
DROP INDEX "appointments_clinicId_appointmentDate_appointmentTime_active_key";

CREATE UNIQUE INDEX "appointments_doctorId_appointmentDate_appointmentTime_active_key"
  ON "appointments"("doctorId", "appointmentDate", "appointmentTime")
  WHERE status IN ('SCHEDULED', 'CONFIRMED');