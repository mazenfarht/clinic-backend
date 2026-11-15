// src/modules/patients/mrn.ts
//
// Automatic medical record numbers: MRN-000001, MRN-000002, ... one sequence per
// clinic. Used by staff patient creation (when no mrn is supplied) and by the
// public registration page, so both always draw from the same sequence.

import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";

export const MRN_PREFIX = "MRN-";

// How many already-taken numbers we are willing to skip over in one request
// (taken = typed by hand, e.g. someone entered MRN-000002 manually).
const MAX_SKIPS = 1000;

export function formatMrn(n: number): string {
  return `${MRN_PREFIX}${String(n).padStart(6, "0")}`;
}

// Reserves the next free MRN for a clinic. MUST run inside the same transaction
// that inserts the patient:
//   - The counter is bumped with a single UPDATE, which takes a row lock on the
//     clinic until the transaction ends. Two requests at the same moment
//     therefore get different numbers (no duplicates, no retry loop).
//   - If the patient insert fails, the transaction rolls back and the counter
//     goes back too, so a failed request does not burn a number.
//   - A number someone already typed by hand is skipped, never reused.
// Raw SQL is used on purpose so Clinic.updatedAt is not touched every time a
// patient is created.
export async function allocateMrn(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<string> {
  for (let i = 0; i < MAX_SKIPS; i++) {
    const rows = await tx.$queryRaw<{ nextMrn: number }[]>`
      UPDATE "clinics"
      SET "nextMrn" = "nextMrn" + 1
      WHERE "id" = ${clinicId}
      RETURNING "nextMrn"
    `;

    if (rows.length === 0) {
      throw new NotFoundError("Clinic not found");
    }

    // RETURNING gives the value AFTER the bump; the number we own is the one before.
    const candidate = formatMrn(rows[0].nextMrn - 1);

    const taken = await tx.patient.findFirst({
      where: { clinicId, mrn: candidate },
      select: { id: true },
    });

    if (!taken) return candidate;
  }

  throw new ConflictError(
    "Could not allocate a medical record number, please retry"
  );
}
