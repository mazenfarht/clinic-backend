# Clinic Backend

A multi-clinic management API: patients, appointments, online booking, a live
waiting-room queue, visits and a dashboard. Built with **Express 5, TypeScript,
Prisma and PostgreSQL**.

One deployment serves many clinics. Every record belongs to a clinic, and every
query is scoped to the clinic of the signed-in user.

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Quick start](#quick-start)
4. [Configuration](#configuration)
5. [Scripts](#scripts)
6. [Who can do what](#who-can-do-what)
7. [API overview](#api-overview)
8. [How the queue works](#how-the-queue-works)
9. [Data model](#data-model)
10. [Project structure](#project-structure)
11. [Testing](#testing)
12. [Deployment](#deployment)
13. [Security notes](#security-notes)
14. [More documentation](#more-documentation)

---

## Features

- **Multi-clinic (multi-tenant)**: a platform admin creates clinics; each clinic
  has its own doctors, staff, patients and settings.
- **Patients**: soft delete and restore, automatic medical record numbers per
  clinic (`MRN-000001`, `MRN-000002`, ...).
- **Appointments**: working hours per weekday, slot duration, daily patient
  limit, and a status flow (`SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`,
  `NO_SHOW`).
- **Public booking**: a clinic website can list doctors, show free slots,
  register a patient and book without an account.
- **Live queue, one per doctor per day**: check-in, call next, skip, recall,
  serve, reserved slots for VIP numbers, and a public waiting-room screen.
- **Visits**: chief complaint, diagnosis, treatment and prescription, written
  by the doctor.
- **Dashboard**: overview, today, queue, appointments, patients and analytics.
- **Role based access**: platform admin, clinic administrator, doctor and
  receptionist, with doctors seeing only their own medical data and
  receptionists never seeing diagnosis, treatment or prescription.

## Tech stack

| Area | Choice |
| --- | --- |
| Runtime | Node.js 22 |
| Language | TypeScript (strict) |
| Web framework | Express 5 |
| Database | PostgreSQL 16 |
| ORM and migrations | Prisma 6 |
| Validation | Zod |
| Auth | JWT access and refresh tokens, bcrypt password hashing |
| Hardening | helmet, CORS allow-list, express-rate-limit, compression |
| Logging | winston (daily rotating files) and morgan |
| Tests | Jest, ts-jest, supertest |
| Packaging | Docker (multi-stage) and docker compose |

---

## Quick start

### Prerequisites

- Node.js 22 or newer
- PostgreSQL 16 (or Docker, see below)
- npm

### Run locally

```bash
# 1. Install dependencies (also runs `prisma generate`)
npm ci

# 2. Create your environment file and fill in the values
cp .env.example .env
#    Windows PowerShell: Copy-Item .env.example .env

# 3. Create the database schema
npm run prisma:deploy

# 4. (Optional) load a demo clinic, two demo doctors and a platform admin
npm run seed

# 5. Start the API with auto-reload
npm run dev
```

The API listens on `http://localhost:5000`. Check it:

```bash
curl http://localhost:5000/api/v1/health
```

### Run with Docker

`docker compose` starts PostgreSQL and the API together. Migrations are applied
automatically when the API container starts.

```bash
cp .env.example .env     # the JWT secrets must be set; DATABASE_URL is
                         # overridden by docker-compose.yml
docker compose up --build
```

To load demo data into the compose database, run the seed from your machine
(the production image does not ship dev tools such as `tsx`):

```bash
# bash
DATABASE_URL="postgresql://clinic:clinic@localhost:5432/clinic?schema=public" npm run seed
```

```powershell
# PowerShell
$env:DATABASE_URL="postgresql://clinic:clinic@localhost:5432/clinic?schema=public"
npm run seed
```

### What the seed creates

- A platform admin, **only if** `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`
  are set. There is no default admin password.
- A clinic called `Demo Clinic` with default settings.
- Two demo doctors (`SEED_DOCTOR_EMAIL` or `doctor@clinic.com`, and a `+cardio`
  variant). The first is the clinic administrator.

The seed is idempotent. Its defaults are public, so **never run it in
production with the default passwords.**

---

## Configuration

All settings come from environment variables (loaded from `.env`). The app
refuses to start if a required one is missing.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | | PostgreSQL connection string |
| `JWT_SECRET` | yes | | Signs clinic access tokens |
| `JWT_REFRESH_SECRET` | yes | | Signs clinic refresh tokens |
| `ADMIN_JWT_SECRET` | yes | | Signs platform admin tokens. Must differ from the two above |
| `PORT` | no | `5000` | HTTP port |
| `HOST` | no | `0.0.0.0` | Bind address |
| `NODE_ENV` | no | `development` | `development`, `production` or `test` |
| `JWT_EXPIRES_IN` | no | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | no | `30d` | Refresh token lifetime |
| `ADMIN_JWT_EXPIRES_IN` | no | `8h` | Platform admin token lifetime (no refresh token) |
| `BCRYPT_SALT_ROUNDS` | no | `12` | bcrypt cost |
| `CORS_ORIGIN` | no | `http://localhost:3000` | Allowed origins, comma separated |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` | Global rate limit window |
| `RATE_LIMIT_MAX` | no | `100` | Requests per window per IP |
| `CLINIC_TIMEZONE` | no | `Africa/Cairo` | Decides what "today" means for queues and bookings |
| `LOG_LEVEL` | no | `info` | winston level |
| `LOG_DIR` | no | `logs` | Log folder |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME` | seed only | | First platform admin |
| `SEED_DOCTOR_EMAIL`, `SEED_DOCTOR_PASSWORD` | seed only | `doctor@clinic.com`, `ChangeMe123!` | Demo doctor |

Generate strong secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload (`tsx watch`) |
| `npm run build` | Generate the Prisma client and compile to `dist/` |
| `npm start` | Run the compiled server (`dist/server.js`) |
| `npm run typecheck` | Type-check without emitting files |
| `npm run prisma:migrate` | Create and apply a migration in development |
| `npm run prisma:deploy` | Apply pending migrations (production and CI) |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run seed` | Load demo data |

---

## Who can do what

There are two separate token families. A clinic token can never be used as a
platform admin token, and the other way round.

| Actor | Signs in at | Can |
| --- | --- | --- |
| **Platform admin** | `POST /admin/auth/login` | Create and manage clinics, add doctors, reset user passwords, see platform stats |
| **Clinic administrator** (a doctor with `isClinicAdmin`) | `POST /auth/login` | Everything a doctor can, plus change clinic settings and manage staff accounts |
| **Doctor** | `POST /auth/login` | Run their queue, write visits, see and manage their own patients' medical data, edit their own profile |
| **Receptionist** | `POST /auth/login` | Manage patients, appointments and the queue. Never receives diagnosis, treatment or prescription |
| **Public visitor** | none | Use the `/public` booking and waiting-screen endpoints |

Details that matter:

- A doctor only sees visits and appointments that belong to them. Another
  doctor's diagnoses never appear in the shared patient record.
- Receptionist responses have `diagnosis`, `treatment` and `prescription`
  removed everywhere (visits, appointments, patients, dashboard).
- Doctors are created by the platform admin (`POST /admin/clinics` and
  `POST /admin/clinics/:id/doctors`), never by another doctor.
- The doctor created together with a clinic is its administrator. A clinic
  administrator can grant or revoke the role on another doctor with
  `PATCH /users/:id/admin`.

---

## API overview

- **Base URL:** `http://localhost:5000/api/v1`
- **Auth header:** `Authorization: Bearer <accessToken>`
- **Format:** JSON in and out. Dates are `YYYY-MM-DD` and are validated as real
  calendar dates (`2026-02-31` is rejected, not rolled over).

Every response uses the same envelope:

```json
{ "success": true, "message": "Success", "data": {}, "meta": { "page": 1, "limit": 20, "total": 120, "totalPages": 6 } }
```

```json
{ "success": false, "message": "Validation failed", "errors": [{ "field": "reason" }] }
```

`meta` appears on paginated lists only.

### Authentication flow

1. `POST /auth/login` with `{ "email", "password" }` returns an access token
   and a refresh token. If the same email exists in more than one clinic, also
   send `clinicId`.
2. Send the access token on every request. It lasts 15 minutes by default.
3. When it expires, call `POST /auth/refresh` with the refresh token.
4. `POST /auth/logout` revokes the refresh token.

### Endpoints

| Area | Endpoints | Access |
| --- | --- | --- |
| Health | `GET /health` | public |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/change-password` | login and refresh public, the rest signed in |
| Patients | `GET/POST /patients`, `GET/PATCH/DELETE /patients/:id`, `PATCH /patients/:id/restore` | doctor, receptionist |
| Appointments | `GET/POST /appointments`, `GET/PATCH /appointments/:id`, `PATCH /appointments/:id/{confirm,cancel,complete,no-show}` | doctor, receptionist |
| Queue | `GET /queue`, `GET /queue/status`, `GET /queue/statistics`, `GET /queue/:id`, `POST /queue/{check-in,reserve,call-next,reset}`, `POST /queue/:id/check-in`, `PATCH /queue/:id/{start,serve,skip,recall,cancel}` | doctor, receptionist |
| Visits | `GET /visits`, `GET /visits/:id`, `GET /patients/:patientId/visits` (read: doctor, receptionist), `POST /visits`, `PATCH/DELETE /visits/:id` (doctor only) | see left |
| Dashboard | `GET /dashboard/{overview,today,queue,appointments,patients,analytics}` | doctor, receptionist |
| Doctors | `GET /doctors`, `PATCH /doctors/:id` (own profile only) | list: doctor, receptionist. Edit: doctor |
| Clinic settings | `GET /clinic-settings` (doctor), `PATCH /clinic-settings` (clinic administrator) | see left |
| Staff accounts | `POST /users/receptionist`, `GET /users`, `PATCH /users/:id/status`, `PATCH /users/:id/admin` | clinic administrator |
| Public booking | `GET /public/clinics/:clinicId/{doctors,availability,waiting-screen}`, `POST /public/clinics/:clinicId/{patients/lookup,patients/register,appointments}` | public, rate limited |
| Platform admin | `POST /admin/auth/login`, `GET /admin/auth/me`, `POST /admin/auth/logout`, `GET/POST /admin/clinics`, `GET/PATCH /admin/clinics/:id`, `PATCH /admin/clinics/:id/status`, `POST /admin/clinics/:id/doctors`, `POST /admin/clinics/:id/users/:userId/reset-password`, `GET /admin/stats` | platform admin |

For request and response bodies, see [More documentation](#more-documentation).

### Rate limits (per IP)

| Scope | Limit |
| --- | --- |
| Whole API | `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS` (100 per 15 min by default) |
| Login and refresh (clinic and admin) | 10 per 15 min |
| Public booking writes | 20 per 15 min |
| Public waiting screen | 60 per minute |
| Platform admin writes | 30 per 15 min |

---

## How the queue works

Each doctor has their own queue for each calendar day (in `CLINIC_TIMEZONE`).
An entry moves through `WAITING`, `IN_PROGRESS`, then `SERVED` (or `CANCELLED`).

**Who is called next** (`POST /queue/call-next`):

1. Scheduled patients, by appointment time. A patient who arrives late waits for
   up to three later checked-in patients before being called.
2. Then checked-in reserved patients, by their reserved number (1 to 3).
3. Then walk-ins, in arrival order.

**Skip** (`PATCH /queue/:id/skip`): the patient goes back to `WAITING` on hold
and returns after **3 other patients have been served**, at their normal place.
With `A, B, C, D, E` and A skipped, the order becomes `B, C, D, A, E`. Skipping
again starts a new hold. If nobody else is waiting, the patient is called again
at once.

**Reserved slots** hold a queue number for someone who has not arrived yet:

1. `POST /queue/reserve` holds the number.
2. The slot can never be called while nobody is checked in.
3. When the person arrives, `POST /queue/:id/check-in` with `{ "patientId" }`
   turns the slot into a real queue entry, which then follows the order above.

The public waiting screen (`GET /public/clinics/:clinicId/waiting-screen`) shows
the current patient and who is next, with names masked.

---

## Data model

The entity relationship diagram is in [`ERD Clinic.png`](ERD%20Clinic.png).

| Model | Purpose |
| --- | --- |
| `Clinic`, `ClinicSettings` | A tenant, with working hours, slot length, daily limit and waiting-screen mode |
| `User` | A clinic login with role `DOCTOR` or `RECEPTIONIST` and the `isClinicAdmin` flag |
| `Doctor` | Doctor profile (specialty) linked to a user |
| `Patient` | Clinic patient with an MRN, soft deleted |
| `Appointment` | A booked slot with a status |
| `Visit` | One consultation: complaint, diagnosis, treatment, prescription |
| `QueueEntry` | A place in a doctor's queue for one day |
| `RefreshToken` | Server-side refresh tokens, revocable |
| `PlatformAdmin` | Platform-level admin, separate from clinic users |

Migrations live in `prisma/migrations`. Never edit one that has been applied;
add a new one with `npm run prisma:migrate`.

---

## Project structure

```
.
├── prisma/
│   ├── schema.prisma          # data model
│   ├── migrations/            # SQL migrations
│   └── seed.ts                # demo data
├── src/
│   ├── server.ts              # HTTP server, graceful shutdown
│   ├── app.ts                 # middleware stack
│   ├── config/                # env validation, database client
│   ├── routes/index.ts        # mounts every module under /api/v1
│   ├── middleware/            # errors, 404, rate limits, logging,
│   │                          # receptionist data redaction
│   ├── modules/
│   │   ├── auth/  users/  doctors/  clinic-settings/
│   │   ├── patients/  appointments/  visits/
│   │   ├── queue/  dashboard/  public/
│   │   └── admin/             # platform admin (auth, clinics, stats)
│   └── shared/                # errors, response helpers, date and time utils
├── tests/
│   ├── unit/                  # no database needed
│   ├── integration/           # full HTTP tests against PostgreSQL
│   └── helpers/               # app, prisma client, factories
├── Dockerfile
└── docker-compose.yml
```

Each module follows the same layers:
`*.routes.ts` -> `*.controller.ts` -> `*.service.ts`, with Zod schemas in
`*.validation.ts` and types in `*.types.ts`. Controllers parse input and call a
service; services hold the business rules and talk to Prisma.

---

## Testing

```bash
# Unit tests: no database required
npx jest tests/unit

# Integration tests: need a PostgreSQL test database
npx jest tests/integration

# Everything
npx jest
```

Type-check the source and the tests:

```bash
npm run typecheck
npx tsc --noEmit -p tests/tsconfig.json
```

Integration tests create and delete their own data, but they **write to the
database they connect to**, so use a dedicated empty one. The connection string
and test secrets are set in `tests/env.setup.ts`; edit `DATABASE_URL` there to
match your machine. Prepare the test database with the same migrations:

```bash
# bash
DATABASE_URL="<your test database url>" npm run prisma:deploy
```

```powershell
# PowerShell
$env:DATABASE_URL="<your test database url>"
npm run prisma:deploy
```

Tests run in a single worker (`maxWorkers: 1`) because they share one database.

---

## Deployment

The `Dockerfile` builds in two stages and runs as `node:22-slim`. On start the
container runs `prisma migrate deploy` and then the server on port `5000`.

Checklist:

1. Set strong, distinct `JWT_SECRET`, `JWT_REFRESH_SECRET` and `ADMIN_JWT_SECRET`.
2. Set `NODE_ENV=production`.
3. Set `CORS_ORIGIN` to your real frontend origin(s).
4. Point `DATABASE_URL` at a managed PostgreSQL with backups.
5. Create the first platform admin once, with `SUPER_ADMIN_EMAIL` and
   `SUPER_ADMIN_PASSWORD` set and the seed run from a trusted machine. Do not
   keep the demo doctors or their default password.
6. Put the API behind HTTPS. `trust proxy` is set to 1, so run it behind one
   reverse proxy or load balancer so rate limiting sees real client IPs.
7. Use `GET /api/v1/health` for health checks.

---

## Security notes

- Passwords are hashed with bcrypt. Login, refresh and admin endpoints are
  rate limited more strictly than the rest of the API.
- Access tokens are short lived. Refresh tokens are stored server-side and are
  revoked on logout and when an account is deactivated.
- Platform admin and clinic tokens use different secrets and cannot be mixed.
- Doctors cannot read each other's medical data, and receptionists never
  receive diagnosis, treatment or prescription.
- Only clinic administrators can change clinic settings or manage staff.

**Known limitation: public booking has no phone verification.** Anyone who
knows a registered patient's phone number can look up that patient and book an
appointment in their name, and the booking response includes the patient's full
name. Only the IP rate limiter protects these endpoints. If your clinic needs
stronger guarantees, add a verification step (for example an SMS code) before
the booking endpoints. See [`SECURITY-FIXES.md`](SECURITY-FIXES.md).

---

## More documentation

| File | What is in it |
| --- | --- |
| [`API-Reference.md`](API-Reference.md) | Short reference with sample requests |
| [`Api-Doc.md`](Api-Doc.md) | Detailed API documentation and a frontend integration guide |
| [`Clinic-API-Postman-Testing-Guide.md`](Clinic-API-Postman-Testing-Guide.md) | Step-by-step manual testing guide for Postman |
| [`SECURITY-FIXES.md`](SECURITY-FIXES.md) | Queue, privacy, permission and date fixes, with deploy steps |
| [`ERD Clinic.png`](ERD%20Clinic.png) | Database diagram |

> The API documents above may lag behind the code. When they disagree, the
> route files in `src/modules/*/*.routes.ts` are the source of truth.

## License

ISC
