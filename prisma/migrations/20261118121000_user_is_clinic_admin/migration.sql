-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isClinicAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: until now every DOCTOR could manage the clinic. Keep each clinic
-- manageable by promoting its earliest-created doctor; further admins can be
-- granted by that doctor through PATCH /users/:id/admin.
UPDATE "users" SET "isClinicAdmin" = true
WHERE "id" IN (
  SELECT DISTINCT ON ("clinicId") "id"
  FROM "users"
  WHERE "role" = 'DOCTOR'
  ORDER BY "clinicId", "createdAt" ASC, "id" ASC
);
