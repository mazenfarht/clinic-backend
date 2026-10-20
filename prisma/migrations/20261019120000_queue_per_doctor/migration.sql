-- Per-doctor queues & visits, waiting-screen mode ---------------------------

-- Waiting screen mode (clinic setting)
CREATE TYPE "WaitingScreenMode" AS ENUM ('NUMBERS', 'NAMES');
ALTER TABLE "clinic_settings"
  ADD COLUMN "waitingScreenMode" "WaitingScreenMode" NOT NULL DEFAULT 'NUMBERS';

-- New columns
ALTER TABLE "visits" ADD COLUMN "doctorId" TEXT;
ALTER TABLE "queue_entries" ADD COLUMN "doctorId" TEXT;

-- Backfill queue entries: first from the linked appointment's doctor ...
UPDATE "queue_entries" q
SET "doctorId" = a."doctorId"
FROM "appointments" a
WHERE a."visitId" = q."visitId"
  AND a."doctorId" IS NOT NULL
  AND q."doctorId" IS NULL;

-- ... then the clinic's earliest-created doctor (legacy single-schedule clinics)
UPDATE "queue_entries" q
SET "doctorId" = (
  SELECT d."id" FROM "doctors" d
  WHERE d."clinicId" = q."clinicId"
  ORDER BY d."createdAt" ASC, d."id" ASC
  LIMIT 1
)
WHERE q."doctorId" IS NULL;

-- Backfill visits: appointment's doctor, then queue entry's doctor, then earliest doctor
UPDATE "visits" v
SET "doctorId" = a."doctorId"
FROM "appointments" a
WHERE a."visitId" = v."id"
  AND a."doctorId" IS NOT NULL
  AND v."doctorId" IS NULL;

UPDATE "visits" v
SET "doctorId" = q."doctorId"
FROM "queue_entries" q
WHERE q."visitId" = v."id"
  AND q."doctorId" IS NOT NULL
  AND v."doctorId" IS NULL;

UPDATE "visits" v
SET "doctorId" = (
  SELECT d."id" FROM "doctors" d
  WHERE d."clinicId" = v."clinicId"
  ORDER BY d."createdAt" ASC, d."id" ASC
  LIMIT 1
)
WHERE v."doctorId" IS NULL;

-- Foreign keys
ALTER TABLE "visits" ADD CONSTRAINT "visits_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Queue numbers are now unique PER DOCTOR per day
DROP INDEX "queue_entries_clinicId_queueDate_queueNumber_key";
CREATE UNIQUE INDEX "queue_entries_doctorId_queueDate_queueNumber_key"
  ON "queue_entries"("doctorId", "queueDate", "queueNumber");
CREATE INDEX "queue_entries_doctorId_queueDate_status_idx"
  ON "queue_entries"("doctorId", "queueDate", "status");

-- A patient can see several doctors on the same day, but only once per doctor
DROP INDEX "visits_patientId_visitDate_key";
CREATE UNIQUE INDEX "visits_patientId_visitDate_doctorId_key"
  ON "visits"("patientId", "visitDate", "doctorId");
CREATE INDEX "visits_doctorId_visitDate_idx"
  ON "visits"("doctorId", "visitDate");