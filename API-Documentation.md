# 📘 Clinic Backend — API Documentation

> This document was written by reading the **actual source code** (`src/modules/**`, `src/middleware/**`, `src/config/**`, `prisma/schema.prisma`) in [mazenfarht/clinic-backend](https://github.com/mazenfarht/clinic-backend) at the time of writing (main branch, Nov 19 2026) — **not** from `README.md`, `API-Reference.md`, `Api-Doc.md` or `Clinic-API-Postman-Testing-Guide.md` already in the repo. Those files describe an older version of the project (Next.js + in-memory storage). The code that actually runs today is a completely different stack: **Express.js + Prisma + PostgreSQL**, multi-tenant, with real JWT auth. Everything below reflects that real implementation.

---

## 0. Stack & Base URL

- **Framework:** Express.js (TypeScript)
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** JWT access + refresh tokens (`jsonwebtoken`) + bcrypt password hashing
- **Validation:** Zod schemas on every request body / query / params
- **Multi-tenant:** every clinic (`Clinic` model) is fully isolated by `clinicId` — no clinic can ever see another clinic's data

**Base URL:**
```
http://localhost:5000/api/v1
```
The port comes from the `PORT` env var (default `5000`). Every route is mounted under `/api/v1`, except `GET /api/health` (no `/v1`).

---

## 1. Response Envelope

Every single response — success or error — follows one of these three shapes.

### Success
```json
{
  "success": true,
  "message": "Human readable message",
  "data": { }
}
```

### Success with pagination (list endpoints)
```json
{
  "success": true,
  "message": "...",
  "data": [ /* array of items */ ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Error (validation, auth failure, not found, server error — all of them)
```json
{
  "success": false,
  "message": "Human readable message",
  "errors": [
    { "field": "email", "message": "Invalid email" }
  ]
}
```
- `errors` is only present when the failure came from Zod validation. Each item has `field` (dot-path of the offending field) and `message` — both are ready to display as-is.
- `stack` may appear in development mode, only for unexpected (non-operational) errors, and never in production.

**Rule of thumb for the frontend:** always check the `success` boolean, not just the HTTP status code. Every error message in `message` / `errors[].message` is already user-presentable text — no need to map codes to custom copy.

### HTTP status codes actually used in the code
| Code | Meaning in this codebase |
|---|---|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request — validation failure, malformed JSON, missing fields |
| 401 | Unauthorized — missing/invalid/expired/revoked token |
| 403 | Forbidden — role not allowed, or a doctor trying to access another doctor's data |
| 404 | Not Found |
| 409 | Conflict — duplicate record (email, MRN, phone, scheduling clash...) |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests — rate limit hit |
| 500 | Internal Server Error |
| 503 | Service Unavailable — database unreachable |

---

## 2. Authentication & Authorization

There are **two completely separate auth systems**, each with its own secret and middleware:

1. **Clinic API** (`/auth/*` and all the normal clinic endpoints) — for `DOCTOR` and `RECEPTIONIST` accounts.
2. **Platform Admin API** (`/admin/*`) — for the platform owner ("super admin") who manages clinics themselves. Totally separate: different token secret (`ADMIN_JWT_SECRET`), different user table (`PlatformAdmin`, not `User`), and **no refresh token**.

### 2.1 Clinic auth — access + refresh tokens

- **Access token** lifetime: `15m` by default (`JWT_EXPIRES_IN`). Sent on every request.
- **Refresh token** lifetime: `30d` by default (`JWT_REFRESH_EXPIRES_IN`). Stored as a row in the `refresh_tokens` table so it can be individually revoked.
- Every refresh **rotates** the token: the old refresh token is revoked and a brand-new pair is issued. If an already-revoked refresh token is presented again (token reuse — a sign it may have leaked), **every session of that user is revoked** automatically as a security measure.
- The access token is sent as:
```
Authorization: Bearer <accessToken>
```

**JWT access token payload:**
```json
{
  "sub": "user-uuid",
  "clinicId": "clinic-uuid",
  "role": "DOCTOR" | "RECEPTIONIST",
  "tv": 0,
  "type": "access"
}
```
> `tv` (`tokenVersion`) is compared against the current value in the database on **every single request**. If it changes — logout-all, password change, account deactivation — every access token issued before that moment is rejected immediately, even if it hasn't technically expired yet.

**Important for the frontend:** the `role` and `clinicId` your backend acts on are **not** trusted from the token blindly — they're re-read from the database on every request (`authMiddleware`). So if a doctor is promoted to clinic admin, or their account is deactivated, it takes effect instantly, without waiting for the token to expire.

### 2.2 Auth endpoints (Clinic) — `/auth`

#### `POST /auth/login`
- **Auth:** none
- **Rate limit:** 10 attempts / 15 min / IP (`authLimiter`)
- **Body:**
```json
{
  "email": "doctor@clinic.com",
  "password": "string (min 8 chars)",
  "clinicId": "uuid (optional)"
}
```
> `clinicId` is only required when the same email exists in more than one clinic (email is unique **per clinic**, not globally). If omitted and there's a clash, the server returns `409 Conflict` with "This email is used by more than one clinic. Please provide clinicId."

- **Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "clinicId": "uuid",
      "email": "doctor@clinic.com",
      "fullName": "Dr. Ahmed",
      "role": "DOCTOR",
      "isActive": true,
      "isClinicAdmin": true,
      "lastLogin": "2026-01-15T10:00:00.000Z",
      "createdAt": "...",
      "updatedAt": "..."
    },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ..."
    }
  }
}
```
- **Errors:** `401` wrong email/password, `403` account `isActive: false`, `409` email ambiguous across clinics.

#### `POST /auth/refresh`
- **Auth:** none (the refresh token itself is the credential)
- **Rate limit:** same `authLimiter`
- **Body:**
```json
{ "refreshToken": "eyJ..." }
```
- **Response (200):**
```json
{
  "success": true,
  "message": "Tokens refreshed successfully",
  "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." }
}
```
> **Important:** the old refresh token is revoked immediately. The frontend must replace **both** tokens after every refresh and never reuse the old refresh token.
- **401** if the token is invalid, expired, or already revoked.

#### `POST /auth/logout` 🔒
- **Auth:** Bearer access token
- **Body:**
```json
{ "refreshToken": "eyJ... (optional)", "allDevices": false }
```
- At least one of the two must be provided. `refreshToken` revokes just that one session; `allDevices: true` revokes every session on every device.
- **Response (200):** `data: null`

#### `GET /auth/me` 🔒
- **Auth:** Bearer access token
- **Response (200):** same `user` shape as login.

#### `PATCH /auth/change-password` 🔒
- **Auth:** Bearer access token
- **Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string (8+ chars, must contain uppercase, lowercase, number, special char)",
  "confirmPassword": "string (must match newPassword)"
}
```
- On success: **every other session is revoked**, and the current session gets a fresh token pair.
- **Response (200):**
```json
{ "success": true, "message": "Password changed successfully", "data": { "tokens": { "accessToken": "...", "refreshToken": "..." } } }
```
- **401** if `currentPassword` is wrong.

### 2.3 Roles

| Role | Description |
|---|---|
| `DOCTOR` | A doctor account. Can additionally have `isClinicAdmin: true` if they're responsible for clinic settings and staff management. |
| `RECEPTIONIST` | Front-desk staff. Sees every doctor's schedule/queue, but is blocked from clinical fields (diagnosis/treatment/prescription). |

**Scoping rules (very important for the frontend):**
- Any request from a `DOCTOR` is **automatically locked to their own data** (their appointments, their queue, their visits). If they try to pass a `doctorId` belonging to someone else → `403 Forbidden`. If they try to access a specific record (appointment/queue entry) that isn't theirs → `404 Not Found` (not 403 — so they can't even confirm the record exists).
- `RECEPTIONIST` sees every doctor in the clinic and can filter with `?doctorId=` for any doctor in the same clinic.

**Clinic Admin (`isClinicAdmin`):** an extra flag on a `DOCTOR` account — grants permission to edit clinic settings and manage staff accounts (`requireClinicAdmin` middleware). A regular doctor without this flag cannot reach those endpoints.

### 2.4 Clinical data redaction for receptionists

On any endpoint that returns Visit data (appointments, visits, queue, dashboard...), if the logged-in user is a `RECEPTIONIST`, a middleware (`redactClinicalDataForReception`) **strips these fields from the JSON response before it reaches the frontend**:
```
diagnosis, treatment, prescription
```
This means when rendering a reception-facing screen, those keys **don't exist at all** in the object — they're not `null`, they're simply absent. The frontend must handle `undefined` for these fields, not just `null`.

---

## 3. Modules — Clinic API (everything under `/api/v1`)

### Router map (from `src/routes/index.ts`)
```
GET  /api/v1/health                      ← health check (no auth)
     /api/v1/auth/*                       ← covered above
     /api/v1/patients/*
     /api/v1/appointments/*
     /api/v1/queue/*
     /api/v1/visits/*
     /api/v1/patients/:patientId/visits   ← a specific patient's visits
     /api/v1/dashboard/*
     /api/v1/clinic-settings/*
     /api/v1/public/*                     ← no auth (public booking site / waiting screen)
     /api/v1/users/*
     /api/v1/doctors/*
     /api/v1/admin/*                      ← separate system (Platform Admin)
```

---

### 3.1 `GET /health`
No auth. Returns:
```json
{
  "success": true,
  "message": "Service is healthy",
  "data": { "status": "healthy", "timestamp": "...", "uptime": 123.45, "environment": "development" }
}
```

---

### 3.2 Patients — `/patients` 🔒 (DOCTOR, RECEPTIONIST)

> Every route here runs `redactClinicalDataForReception` (it doesn't touch the patient object itself, only any embedded visits/appointments it returns).

#### `GET /patients`
- **Query:** `search?`, `gender? (MALE|FEMALE|OTHER)`, `includeDeleted? (true|false)`, `page? (default 1)`, `limit? (default 10, max 100)`
- **Response:** paginated list of `PatientSummary` objects.

```ts
PatientSummary {
  id, clinicId, mrn, fullName, phone,
  dateOfBirth, gender, address, notes,
  deletedAt, createdAt, updatedAt,
  createdBy: { id, fullName } | null,
  updatedBy: { id, fullName } | null
}
```

#### `POST /patients`
- **Body:**
```json
{
  "mrn": "string (optional — if omitted, auto-generated as MRN-000001, MRN-000002, ...)",
  "fullName": "string (2-100 chars)",
  "phone": "string (7-20 chars, e.g. +20... or plain digits)",
  "dateOfBirth": "YYYY-MM-DD (must be in the past, after 1900-01-01)",
  "gender": "MALE | FEMALE | OTHER",
  "address": "string (optional, max 255)",
  "notes": "string (optional, max 1000)"
}
```
- **201 Created**, `data`: PatientSummary.
- **409 Conflict** if `phone` or `mrn` already exists in the same clinic (unique on `clinicId+phone` and `clinicId+mrn`).

#### `GET /patients/:id`
- Returns `PatientDetail` which also includes a short `visits[]` and `appointments[]` list. If the caller is a `DOCTOR`, these are filtered to that doctor's own records only.

#### `PATCH /patients/:id`
- Any of: `fullName, phone, dateOfBirth, gender, address (nullable), notes (nullable)` — at least one field required.

#### `DELETE /patients/:id`
- **Soft delete** — sets `deletedAt`, never actually removes the row. `data: null`.

#### `PATCH /patients/:id/restore`
- Un-deletes a patient (`deletedAt: null`).

---

### 3.3 Appointments — `/appointments` 🔒 (DOCTOR, RECEPTIONIST)

#### `GET /appointments`
- **Query:** `search?`, `status? (SCHEDULED|CONFIRMED|COMPLETED|CANCELLED|NO_SHOW)`, `patientId?`, `doctorId?`, `date? (YYYY-MM-DD)`, `fromDate?`, `toDate?`, `page?`, `limit? (max 100)`.
- If the caller is a `DOCTOR`, `doctorId` is forced to their own id even if a different one was passed (`403` if it mismatches).

#### `POST /appointments`
```json
{
  "patientId": "uuid",
  "doctorId": "uuid",
  "appointmentDate": "YYYY-MM-DD (cannot be in the past)",
  "appointmentTime": "HH:MM (24-hour)",
  "notes": "string (optional, max 1000)"
}
```
- **201 Created**. If the doctor already has a `SCHEDULED` or `CONFIRMED` appointment at the same date/time → `409 Conflict` (enforced by a database constraint, not just app logic).

#### `GET /appointments/:id`
- `AppointmentDetail` — includes the linked `visit` (if any) with its full data.

#### `PATCH /appointments/:id`
- Any of: `doctorId?, appointmentDate?, appointmentTime?, notes? (nullable)`.

#### Status-change actions (all `PATCH`, no body needed):
| Endpoint | From | To |
|---|---|---|
| `/appointments/:id/confirm` | SCHEDULED | CONFIRMED |
| `/appointments/:id/cancel` | SCHEDULED or CONFIRMED | CANCELLED |
| `/appointments/:id/complete` | CONFIRMED | COMPLETED |
| `/appointments/:id/no-show` | SCHEDULED or CONFIRMED | NO_SHOW |

> Any disallowed transition (e.g. completing a still-SCHEDULED appointment) is rejected. The allowed transitions are hardcoded (`ALLOWED_STATUS_TRANSITIONS`).

---

### 3.4 Queue — `/queue` 🔒 (DOCTOR, RECEPTIONIST)

> Every doctor has their own queue — there is no single shared queue. Queue numbers (`queueNumber`) are unique per `(doctorId, queueDate)`.

**QueueStatus flow:** `WAITING → IN_PROGRESS → SERVED`, or `→ CANCELLED` from either `WAITING` or `IN_PROGRESS`.

#### `GET /queue`
- **Query:** `status?`, `doctorId?`, `date? (defaults to today)`, `page?`, `limit? (default 20, max 100)`.

#### `GET /queue/status`
- If a `doctorId` is known (or the caller is a doctor), returns a single object:
```json
{
  "currentlyServing": { /* QueueEntrySummary */ } | null,
  "nextWaiting": { /* QueueEntrySummary */ } | null,
  "waitingCount": 3,
  "servedCount": 7
}
```
- If a receptionist doesn't specify `doctorId` → returns an **array** of the same shape plus `doctor: { id, fullName, specialty }` for every doctor in the clinic.

#### `GET /queue/statistics`
- **Query:** `doctorId?`, `date?`
```json
{
  "date": "2026-01-15",
  "total": 10, "waiting": 2, "inProgress": 1, "served": 6, "cancelled": 1,
  "averageWaitTimeMinutes": 12.5,
  "averageServeTimeMinutes": 8.2
}
```

#### `POST /queue/check-in`
- Adds a patient to the queue as a real, already-arrived entry.
```json
{
  "patientId": "uuid",
  "doctorId": "uuid (optional, required if you're a receptionist and there's no appointmentId)",
  "appointmentId": "uuid (optional)",
  "chiefComplaint": "string (max 500, optional)",
  "notes": "string (max 1000, optional)"
}
```
- **201 Created** → `QueueEntrySummary` (a `Visit` is created behind the scenes and linked to the entry — that's where `visitId` comes from).

#### `POST /queue/reserve`
- Reserves one of the first 3 queue numbers only (for cases like "this slot is held for someone arriving later"), with no actual patient attached yet.
```json
{
  "doctorId": "uuid (optional)",
  "reservedFor": "string (1-100 chars — a name or description)",
  "queueNumber": 1 | 2 | 3,
  "notes": "string (optional)"
}
```
- **201 Created**, `isReserved: true`.

#### `POST /queue/:id/check-in` (the patient holding a reserved slot has arrived)
```json
{
  "patientId": "uuid",
  "chiefComplaint": "string (optional)",
  "notes": "string (optional)"
}
```
- Turns the reserved slot into a real entry.

#### `GET /queue/:id`
- A single `QueueEntrySummary`.

#### `POST /queue/call-next`
- **Body:** `{ "doctorId": "uuid (optional if you're a doctor)" }`
- Calls the first `WAITING` entry in order (respecting skips), sets it to `IN_PROGRESS`, and automatically moves any previously `IN_PROGRESS` entry to `SERVED`.

#### `PATCH /queue/:id/start` — starts the consultation (`startedAt`)
#### `PATCH /queue/:id/serve` — ends the consultation (`status: SERVED`, `servedAt`)
#### `PATCH /queue/:id/skip` — skips the patient (`skippedAt` — they go behind everyone who hasn't been skipped, until recalled)
#### `PATCH /queue/:id/recall` — recalls a previously skipped patient
```json
{ "notes": "string (optional)" }
```
#### `PATCH /queue/:id/cancel` — cancels an entry (from `WAITING` or `IN_PROGRESS`)
#### `POST /queue/reset`
- **Body:** `{ "doctorId": "uuid (optional)" }`
- Cancels every entry still `WAITING` or `IN_PROGRESS` for a given day.
- **Response:**
```json
{ "success": true, "message": "Queue reset successfully. 3 entries cancelled.", "data": { "cancelled": 3 } }
```

---

### 3.5 Visits — `/visits` 🔒

> Reading is open to both `DOCTOR` and `RECEPTIONIST` (with redaction applied for receptionists). **Writing (create/update/delete) is DOCTOR-only.**

#### `GET /visits`
- **Query:** `search?`, `patientId?`, `doctorId?`, `createdById?`, `date?`, `fromDate?`, `toDate?`, `sortBy? (visitDate|createdAt, default visitDate)`, `sortOrder? (asc|desc, default desc)`, `page?`, `limit?`.

#### `GET /visits/:id`
#### `GET /patients/:patientId/visits` (separate route mounted under patients, uses the same controller)

#### `POST /visits` 🔒 DOCTOR only
```json
{
  "patientId": "uuid",
  "appointmentId": "uuid (optional)",
  "queueEntryId": "uuid (optional)",
  "visitDate": "YYYY-MM-DD (optional, defaults to today)",
  "chiefComplaint": "string (max 500, optional)",
  "diagnosis": "string (max 1000, optional)",
  "treatment": "string (max 1000, optional)",
  "prescription": "string (max 1000, optional)",
  "notes": "string (max 1000, optional)"
}
```
> Unique constraint: a patient can't have more than one visit with the same doctor on the same day (`patientId+visitDate+doctorId`).

#### `PATCH /visits/:id` 🔒 DOCTOR only
- Any of: `chiefComplaint, diagnosis, treatment, prescription, notes` (all nullable), and `followUpDate` (must be a **future** date).

#### `DELETE /visits/:id` 🔒 DOCTOR only

---

### 3.6 Dashboard — `/dashboard` 🔒 (DOCTOR, RECEPTIONIST + redaction)

All GET, no body:

| Endpoint | Description |
|---|---|
| `GET /dashboard/overview?doctorId=&date=` | General counts: patients, appointments, visits, queue |
| `GET /dashboard/today?doctorId=&date=` | Details for one day: today's appointments + today's visits + current queue state |
| `GET /dashboard/queue?doctorId=&date=&page=&limit=` | Live queue view (currently serving, next, waiting list + stats) |
| `GET /dashboard/appointments?doctorId=&fromDate=&toDate=&page=&limit=` | Upcoming / completed / cancelled appointments, split |
| `GET /dashboard/patients?doctorId=&page=&limit=` | Recently registered patients + recent visits + gender breakdown |
| `GET /dashboard/analytics?doctorId=&fromDate=&toDate=` | Period analytics: daily visits/appointments, monthly registrations, completion/cancellation rates |

> All query params are optional. If the caller is a `DOCTOR`, `doctorId` is always forced to their own id regardless of what's passed.

`AnalyticsDashboard` shape (the biggest response):
```json
{
  "period": { "from": "2026-01-01", "to": "2026-01-31" },
  "visitsPerDay": [{ "date": "2026-01-01", "count": 5 }],
  "appointmentsPerDay": [{ "date": "2026-01-01", "count": 8 }],
  "patientsRegisteredPerMonth": [{ "month": "2026-01", "count": 20 }],
  "queueMetrics": {
    "totalServed": 100, "totalCancelled": 5,
    "completionRate": 0.95, "cancellationRate": 0.05,
    "averageWaitTimeMinutes": 10.2, "averageServeTimeMinutes": 7.1
  },
  "appointmentMetrics": {
    "totalCompleted": 80, "totalCancelled": 4,
    "completionRate": 0.95, "cancellationRate": 0.05
  }
}
```

---

### 3.7 Clinic Settings — `/clinic-settings` 🔒 DOCTOR only

#### `GET /clinic-settings`
- Any doctor can read it.
```json
{
  "id", "clinicId",
  "workingHours": { "monday": { "open": "09:00", "close": "17:00", "isOpen": true }, "...": "...for every day of the week" },
  "maxPatientsPerDay": 50,
  "appointmentDuration": 30,
  "gracePeriod": 15,
  "delayThreshold": 20,
  "waitingScreenMode": "NUMBERS" | "NAMES",
  "clinic": { "id", "name", "phone", "email", "address", "isActive", "createdAt", "updatedAt" }
}
```

#### `PATCH /clinic-settings` 🔒 **Clinic Admin only** (`isClinicAdmin: true`)
- Any of: `name?, phone? (nullable), email? (nullable), address? (nullable), workingHours?, maxPatientsPerDay? (1-1000), appointmentDuration? (5-480 min), gracePeriod? (1-120), delayThreshold? (1-240), waitingScreenMode? (NUMBERS|NAMES)`.
- `waitingScreenMode` controls the public waiting-room screen: `NUMBERS` shows just the queue numbers, `NAMES` additionally shows masked names (e.g. "Ahmed M.").

---

### 3.8 Users (clinic staff) — `/users` 🔒 **Clinic Admin only**

#### `POST /users/receptionist`
```json
{ "email": "string", "password": "string (8+ chars, complexity rules)", "fullName": "string (2-100)" }
```
- Creates a new `RECEPTIONIST` account in the same clinic as the admin. **201 Created**.

#### `GET /users`
- Returns every account in the clinic (doctors + receptionists).

#### `PATCH /users/:id/status`
```json
{ "isActive": true | false }
```
- Activate/deactivate an account. Deactivation revokes all of their sessions immediately.

#### `PATCH /users/:id/admin`
```json
{ "isClinicAdmin": true | false }
```
- Grant/revoke "clinic admin" — only applicable to accounts with role `DOCTOR`.

---

### 3.9 Doctors — `/doctors` 🔒

#### `GET /doctors` (DOCTOR, RECEPTIONIST)
- Returns every doctor in the clinic.

#### `PATCH /doctors/:id` 🔒 DOCTOR only
- A doctor can only edit **their own profile** (`403` if they try to edit someone else's).
```json
{
  "specialty?": "string (2-100)",
  "bio?": "string|null (max 1000)",
  "appointmentDuration?": "number|null (5-240 min)",
  "workingHours?": "object|null (same shape as clinic settings)",
  "isBookable?": "boolean"
}
```
> **Note:** there is no `POST /doctors` — creating a new doctor only happens through the Platform Admin API (`/admin/clinics/:id/doctors`), never from here.

---

### 3.10 Public API — `/public` (no authentication — powers the public booking site and waiting-room screen)

All routes here take `:clinicId` in the URL and have nothing to do with login (no Authorization header at all).

#### `GET /public/clinics/:clinicId/waiting-screen?doctorId=`
- This is the endpoint a waiting-room TV screen polls roughly once a second.
- **Rate limit:** 60 requests/minute/IP.
```json
{
  "mode": "NUMBERS" | "NAMES",
  "generatedAt": "2026-01-15T10:00:00.000Z",
  "doctors": [
    {
      "doctorId": "uuid", "fullName": "Dr. Ahmed", "specialty": "Dermatology",
      "nowServing": { "queueNumber": 5, "patientName": null },
      "next": { "queueNumber": 6, "patientName": null },
      "waitingCount": 3
    }
  ]
}
```
> `patientName` is `null` in `NUMBERS` mode, and a masked name (e.g. "Ahmed M.") in `NAMES` mode.

#### `GET /public/clinics/:clinicId/doctors`
- List of doctors open to online booking only (`isBookable: true`).

#### `GET /public/clinics/:clinicId/availability?doctorId=&date=YYYY-MM-DD`
- Available slots for a given doctor on a given day.

#### `POST /public/clinics/:clinicId/patients/lookup`
- **Rate limit:** 20 requests/15 min/IP
```json
{ "phone": "string" }
```
- Looks up an already-registered patient by phone (to avoid duplicate registrations).

#### `POST /public/clinics/:clinicId/patients/register`
```json
{
  "fullName": "string (2-100)",
  "phone": "string",
  "dateOfBirth": "YYYY-MM-DD",
  "gender": "MALE | FEMALE | OTHER"
}
```
- **201 Created** — self-service registration, no staff account needed.

#### `POST /public/clinics/:clinicId/appointments`
```json
{
  "patientId": "uuid",
  "doctorId": "uuid",
  "appointmentDate": "YYYY-MM-DD",
  "appointmentTime": "HH:MM",
  "notes": "string (optional)"
}
```
- **201 Created** — self-service booking from the public site.

---

## 4. Platform Admin API — `/admin/*`

> A fully separate system — its own table (`PlatformAdmin`, not `User`), its own token secret (`ADMIN_JWT_SECRET`), and **no refresh token** (the admin just logs in again when the token expires, default `8h`). **This is not part of the regular clinic UI — it's the platform owner's control panel for onboarding new clinics.**

Required header for all admin routes except login:
```
Authorization: Bearer <adminAccessToken>
```

### 4.1 `/admin/auth`

#### `POST /admin/auth/login`
```json
{ "email": "string", "password": "string" }
```
```json
{
  "success": true, "message": "Login successful",
  "data": {
    "admin": { "id", "email", "fullName", "isActive", "lastLogin", "createdAt", "updatedAt" },
    "session": { "accessToken": "eyJ...", "expiresAt": "2026-01-15T18:00:00.000Z" }
  }
}
```

#### `GET /admin/auth/me` 🔒
#### `POST /admin/auth/logout` 🔒 — revokes every admin session (there's no "log out this device only" here)
#### `PATCH /admin/auth/change-password` 🔒
```json
{ "currentPassword": "string", "newPassword": "string (max 72 chars)", "confirmPassword": "string" }
```

### 4.2 `/admin/clinics` 🔒

#### `GET /admin/clinics?search=&status=active|inactive|all&page=&limit=`

#### `POST /admin/clinics`
- Creates a **new clinic + its first doctor + its settings** in one request. **The password is randomly generated server-side and returned only once** (the response includes `Cache-Control: no-store`).
```json
{
  "clinic": { "name": "string (2-100)", "phone?": "string", "email?": "string", "address?": "string" },
  "doctor": { "fullName": "string", "email": "string", "specialty": "string", "bio?": "string" },
  "settings?": { "workingHours?": "...", "maxPatientsPerDay?": 50, "appointmentDuration?": 30, "gracePeriod?": 15, "delayThreshold?": 20 }
}
```
- **201 Created** — the response includes the doctor's temporary password (once only — the frontend must display it immediately and tell the user to save it).

#### `GET /admin/clinics/:id`
#### `PATCH /admin/clinics/:id` — update clinic details (name/phone/email/address)
#### `PATCH /admin/clinics/:id/status` — `{ "isActive": true|false }` (suspend/reactivate an entire clinic)
#### `POST /admin/clinics/:id/doctors` — add a new doctor to an existing clinic (same one-time temporary password pattern)
#### `POST /admin/clinics/:id/users/:userId/reset-password` — reset a staff member's password (new random password, returned once)

> **Every write endpoint here is rate limited: 30 requests/15 min/IP** (`adminWriteLimiter`).

### 4.3 `/admin/stats` 🔒

#### `GET /admin/stats`
```json
{
  "clinics": { "total": 12, "active": 10, "inactive": 2 },
  "doctors": 25,
  "receptionists": 15,
  "patients": 3400,
  "thisMonth": { "appointments": 540, "visits": 480 },
  "generatedAt": "2026-01-15T10:00:00.000Z"
}
```

---

## 5. Enums (from `prisma/schema.prisma`)

```ts
Role              = "DOCTOR" | "RECEPTIONIST"
Gender            = "MALE" | "FEMALE" | "OTHER"
AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"
QueueStatus       = "WAITING" | "IN_PROGRESS" | "SERVED" | "CANCELLED"
WaitingScreenMode = "NUMBERS" | "NAMES"
```

---

## 6. Gotchas the frontend needs to know

1. **Every date you send** (`appointmentDate`, `dateOfBirth`, `visitDate`, `followUpDate`...) must be a plain `YYYY-MM-DD` string — not a full ISO timestamp. Time is sent separately (`appointmentTime: "HH:MM"`).
2. **The clinic's timezone** defaults to `Africa/Cairo` (`CLINIC_TIMEZONE`). Date validation compares the submitted date against "today" in that timezone (`getClinicTodayStr`) — so even if the server machine runs in a different timezone, "today" is always Cairo's today.
3. **Pagination params** are usually `page` (default 1) and `limit` (default varies per endpoint, always capped at 100).
4. **Every phone field** must match `^\+?[0-9\s\-().]+$` and be 7-20 characters long.
5. **Any new password** (change-password, createReceptionist, etc.) must satisfy: 8+ characters, at least one uppercase, one lowercase, one number, one special character.
6. **Role-gated routes:** the frontend should read the current user's role from `GET /auth/me` and hide UI for routes the role can't reach (e.g. clinic settings if not a clinic admin, or diagnosis fields if a receptionist) — but this is UX only. **The server enforces this regardless** of what the frontend allows through.
7. **After a token refresh**, store the new refresh token immediately — the old one is revoked the moment the new one is issued.
8. **Rate limiting:** a `429` response has a ready-to-show `message`, and standard `RateLimit-*` headers are present if you want to build a countdown UI.
9. **The public booking site and waiting-room screen (`/public/*`)** carry no Authorization header at all — treat them as entirely separate pages from the authenticated dashboard.
10. **Receptionists will never receive** `diagnosis` / `treatment` / `prescription` in any response. Don't write shared code that does `data.diagnosis || "—"` across both roles — the key is genuinely absent, not `null`.

---

## 7. Environment variables the backend needs (from `.env.example`) — for reference, not consumed by the frontend

```
JWT_SECRET=...
JWT_EXPIRES_IN=15m          (default)
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRES_IN=30d  (default)
ADMIN_JWT_SECRET=...        (must differ from the two above)
ADMIN_JWT_EXPIRES_IN=8h     (default)
DATABASE_URL=postgresql://...
PORT=5000                   (default)
CORS_ORIGIN=http://localhost:3000   (comma-separated list of allowed frontend origins)
CLINIC_TIMEZONE=Africa/Cairo
```

> **CORS:** the server only accepts requests from origins listed in `CORS_ORIGIN` (comma-separated), with `credentials: true`. Make sure your frontend's domain is in that list, or the browser will block the request before it even reaches these endpoints.

---

*This document was generated by reading the live source code of [mazenfarht/clinic-backend](https://github.com/mazenfarht/clinic-backend), `main` branch, as of November 19, 2026. Any code changes after that point require re-checking this file against the source.*
