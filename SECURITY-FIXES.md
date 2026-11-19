# Fixes: queue, privacy, permissions, dates

## Deploy steps
1. `npx prisma migrate deploy` — two migrations:
   - `20261118120000_queue_skipped_at` — adds `queue_entries.skippedAt`
   - `20261118121000_user_is_clinic_admin` — adds `users.isClinicAdmin`.
     **The backfill makes the earliest-created doctor of every clinic its
     administrator.** Check each clinic has the right one; grant more with
     `PATCH /users/:id/admin`.
2. No new environment variables and no new dependencies.

## What changed
| # | Problem | Fix |
|---|---------|-----|
| 1 | Skip did not skip | A skipped patient is put on **hold** until **3 other patients have been served**, then rejoins at their natural place. `A,B,C,D,E` with A skipped is served `B,C,D,A,E`; everyone else keeps their order. A repeated skip starts a new hold. |
| 2 | Empty reserved slot could be called; walk-in order | A reserved slot becomes callable only after **reception checks the patient in** (`POST /queue/:id/check-in`). Order after check-in: scheduled patients, then checked-in reserved patients (by reserved number 1-3), then walk-ins (arrival order). |
| 4 | Medical data privacy | Receptionist responses never contain `diagnosis`, `treatment` or `prescription` (middleware on visits, appointments, patients, dashboard). `GET /patients/:id` embeds only the requesting doctor's visits and appointments. |
| 5 | Any doctor was an admin | `users.isClinicAdmin` + `requireClinicAdmin`: only an administrator can `PATCH /clinic-settings` and use `/users/*`. New `PATCH /users/:id/admin` grants/revokes the role (doctors only, never on yourself). The doctor created with a clinic is its administrator. |
| 6 | `31 Feb` rolled over to `3 Mar` | `isValidCalendarDate` (leap-year aware, round-trip checked) in every date validator and in `parseDateOnly` / `parseDateFilter`. |

Problem 3 (public booking verification) is **intentionally not fixed**: the
OTP / booking-token design was removed, so the public flow is exactly as before.
See "Accepted risk" below.

## Skip: how the hold works
- `POST`/`PATCH /queue/:id/skip` stamps `skippedAt`, returns the entry to
  `WAITING`, clears `calledAt`/`startedAt` (entry and visit).
- A held patient sorts behind every patient who is not held. The hold ends when
  3 other entries of the same doctor and day were `SERVED` after `skippedAt`
  (cancelled patients do not count; patients served before the skip do not
  count). Then the patient competes at their normal position.
- If nobody else is waiting, a held patient is called immediately.
- Several held patients return in the order they were skipped.
- `skippedAt` is cleared when the entry is called or recalled.
- The number 3 is `SKIP_RETURN_AFTER_PATIENTS` in `queue.service.ts`.

## Reserved slots: how check-in works
1. `POST /queue/reserve` holds number 1-3 (unchanged). The slot has no patient,
   so it is never selected by `call-next`, never shown as "next", and
   `PATCH /queue/:id/recall` on it returns 400.
2. When the person arrives: `POST /queue/:id/check-in` with
   `{ "patientId": "...", "chiefComplaint"?: "...", "notes"?: "..." }`.
   It creates the visit, attaches the patient and sets `checkedInAt`. The slot
   keeps its reserved number and `isReserved: true`.
   Errors: 400 not a reserved slot / not waiting / not today, 404 unknown
   patient, 409 slot already checked in or the patient is already in today's
   queue.
3. From then on it is an ordinary waiting entry (call-next, skip, serve, ...).
- Ordering among entries without an appointment is: checked-in reserved
  patients by reserved number, then walk-ins by arrival time. Scheduled patients
  always come first (late-patient rule unchanged).
- `waitingCount` in status/board/dashboard still counts held reservations
  (status `WAITING`), including slots not yet checked in. Only the "next
  patient" selection ignores them.

## Breaking changes for clients
- New endpoint `POST /queue/:id/check-in` (reserved slots).
- `recall` on a reserved slot without a checked-in patient is now rejected.
- Plain doctors get 403 on `PATCH /clinic-settings` and on `/users/*`
  (`GET /clinic-settings` still works for any doctor).
- Receptionists no longer receive diagnosis / treatment / prescription.
- Auth and user payloads include `isClinicAdmin`.
- Dates such as `2026-02-31` are rejected with 400.

## Accepted risk (public booking without verification)
With OTP removed, the public endpoints are as they were:
- `POST /public/clinics/:id/patients/lookup` returns whether a phone is
  registered, the `patientId`, and a masked name.
- `POST /public/clinics/:id/appointments` books for any `patientId`, and its
  response includes the patient's full, unmasked name.
- The only protection is the existing IP rate limiter.
Anyone who knows a patient's phone number can therefore book in their name and
learn their name.

## Known limits
- `GET /patients` (the list) is still clinic-wide for doctors (demographics only).
