-- Per-clinic counter for auto-generated medical record numbers (MRN-000001).
-- AlterTable
ALTER TABLE "clinics" ADD COLUMN "nextMrn" INTEGER NOT NULL DEFAULT 1;

-- Continue after the highest auto-style MRN each clinic already has (for
-- example numbers created by the public registration page). Only values that
-- are exactly "MRN-" + up to 9 digits are considered, so manually typed MRNs
-- such as "MRN-OLD1" or "A-77" are ignored.
UPDATE "clinics" c
SET "nextMrn" = COALESCE(
  (
    SELECT MAX(CAST(SUBSTRING(p."mrn" FROM 5) AS INTEGER))
    FROM "patients" p
    WHERE p."clinicId" = c."id" AND p."mrn" ~ '^MRN-[0-9]{1,9}$'
  ),
  0
) + 1;
