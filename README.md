# 📋 Clinic Queue System — Full Backend Documentation

> **Stack:** Next.js 15 App Router · TypeScript · In-Memory Storage · JWT Auth (Web Crypto API)

---

## 🗓️ Per-Day Queue Architecture

### Overview

The system maintains **independent queues per calendar day**. Each date gets its own isolated queue with its own counter, patient list, current patient, and served count. This prevents patients from different days being mixed into a single global queue.

### Data Structure

```typescript
// queues — the per-date map (exported from lib/store.ts)
type QueuesMap = Record<string, DailyQueueState>; // key: "YYYY-MM-DD"

interface DailyQueueState {
  patients: Patient[];            // All patients booked for this date
  currentPatient: Patient | null; // Patient currently being seen
  nextQueueNumber: number;        // Next number to assign (starts at 1 per day)
  totalServedToday: number;       // How many have been served on this date
}
```

### Queue Flow Per Date

```
POST /api/book { name, appointmentDate: "2025-06-15" }
      │
      ▼
System initialises queues["2025-06-15"] if not yet present
      │
      ▼
Patient assigned queue number (independent counter per date)
      │
      ▼
GET  /api/queue?date=2025-06-15   → shows only that day's queue
POST /api/next?date=2025-06-15    → advances that day's queue only
```

### Backward Compatibility

- `appointmentDate` in `POST /api/book` is **optional** — omitting it defaults to today's date.
- `?date` in `GET /api/queue` and `POST /api/next` is **optional** — omitting it defaults to today's date.
- All existing API consumers continue to work without modification.

---

## 📁 Project Structure

```
clinic-queue-system/
├── app/
│   └── api/
│       ├── auth/
│       │   └── login/
│       │       └── route.ts          ← POST /api/auth/login
│       ├── queue/
│       │   └── route.ts              ← GET /api/queue
│       ├── book/
│       │   └── route.ts              ← POST /api/book
│       ├── next/
│       │   └── route.ts              ← POST /api/next (protected)
│       ├── reset/
│       │   └── route.ts              ← POST /api/reset (protected)
│       └── patient/
│           └── [id]/
│               └── route.ts          ← DELETE /api/patient/:id (protected)
├── lib/
│   ├── auth.ts                       ← Token generation & verification
│   ├── middleware.ts                  ← requireAuth guard + response helpers
│   ├── queue.ts                      ← Queue business logic
│   └── store.ts                      ← In-memory data store
├── types/
│   └── index.ts                      ← TypeScript interfaces
├── .env.example
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## ⚙️ Setup & Installation

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env.local

# 3. Edit .env.local — set your JWT secret
JWT_SECRET=your-long-random-secret-here

# 4. Start development server
npm run dev

# Server runs at: http://localhost:3000
```

> **Generate a secure secret:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## 🔐 Authentication System

### How It Works

The system uses a **custom JWT implementation** built on the Web Crypto API (`crypto.subtle`). No external JWT library is needed — it runs natively in Node 18+ and Next.js Edge runtime.

**Token Format:** `base64Header.base64Payload.hmacSignature` (standard JWT structure)

**Token Lifetime:** 8 hours from login

**Doctor Credentials (hardcoded):**
| Field    | Value   |
|----------|---------|
| username | `admin` |
| password | `1234`  |

### Token Payload Structure

```json
{
  "username": "admin",
  "role": "doctor",
  "iat": 1717300000,
  "exp": 1717328800
}
```

### How the Frontend Should Handle Tokens

1. **Login** → receive token in response
2. **Store** the token in `localStorage` or `sessionStorage`:
   ```js
   localStorage.setItem("clinic_token", token);
   ```
3. **Attach** to every protected request as a header:
   ```
   Authorization: Bearer <token>
   ```
4. **On logout**, remove the token:
   ```js
   localStorage.removeItem("clinic_token");
   ```
5. **On 401 response**, redirect to the login page.

---

## 📡 API Reference

### Base URL
```
http://localhost:3000/api
```

### Common Response Envelope

All responses follow this structure:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional human-readable message"
}
```

**Error:**
```json
{
  "success": false,
  "error": "Human-readable error description",
  "code": "MACHINE_READABLE_CODE"
}
```

---

### 🔑 `POST /api/auth/login`

**Purpose:** Authenticates the doctor and returns a JWT token.
**Auth Required:** No

**Request Body:**
```json
{
  "username": "admin",
  "password": "1234"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 28800,
    "doctor": {
      "username": "admin",
      "role": "doctor"
    }
  }
}
```

**Error Cases:**
| Status | Code                  | Reason                          |
|--------|-----------------------|---------------------------------|
| 400    | `MISSING_FIELDS`      | username or password missing    |
| 400    | `INVALID_JSON`        | Body is not valid JSON          |
| 401    | `INVALID_CREDENTIALS` | Wrong username or password      |

---

### 🟢 `GET /api/queue`

**Purpose:** Returns the queue state for a specific date. Used by the waiting room display and receptionist screen.
**Auth Required:** No

**Query Parameters:**
| Param  | Type         | Required | Description                              |
|--------|--------------|----------|------------------------------------------|
| `date` | `YYYY-MM-DD` | No       | The date to query. Defaults to today.    |

**Example:**
```
GET /api/queue              → today's queue
GET /api/queue?date=2025-06-15  → queue for June 15 2025
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "date": "2025-01-15",
    "currentPatient": {
      "id": "uuid-here",
      "name": "Ahmed Hassan",
      "queueNumber": 3,
      "status": "current",
      "bookedAt": "2025-01-15T09:30:00.000Z"
    },
    "waiting": [
      {
        "id": "uuid-here",
        "name": "Sara Ali",
        "queueNumber": 4,
        "status": "waiting",
        "bookedAt": "2025-01-15T09:35:00.000Z"
      }
    ],
    "done": [
      {
        "id": "uuid-here",
        "name": "Omar Nour",
        "queueNumber": 2,
        "status": "done",
        "bookedAt": "2025-01-15T09:15:00.000Z"
      }
    ],
    "totalWaiting": 1,
    "totalServedToday": 2,
    "nextQueueNumber": 5
  }
}
```

---

### 🟢 `POST /api/book`

**Purpose:** Books a queue number for a new patient.
**Auth Required:** No

**Request Body:**
```json
{
  "name": "Ahmed Hassan",
  "appointmentDate": "2025-01-15"
}
```

| Field             | Type         | Required | Description                                    |
|-------------------|--------------|----------|------------------------------------------------|
| `name`            | `string`     | Yes      | Patient's name (max 100 chars)                 |
| `appointmentDate` | `YYYY-MM-DD` | No       | Date to book into. Defaults to today.          |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Booking successful",
  "data": {
    "patient": {
      "id": "3f8d7a1c-...",
      "name": "Ahmed Hassan",
      "queueNumber": 5,
      "status": "waiting",
      "bookedAt": "2025-01-15T10:00:00.000Z"
    },
    "message": "Queue number 5 has been assigned to Ahmed Hassan."
  }
}
```

**Error Cases:**
| Status | Code            | Reason                              |
|--------|-----------------|-------------------------------------|
| 400    | `MISSING_NAME`  | name is missing or empty            |
| 400    | `NAME_TOO_LONG` | name exceeds 100 characters         |
| 400    | `INVALID_JSON`  | Body is not valid JSON              |
| 400    | `INVALID_DATE`  | appointmentDate is not YYYY-MM-DD   |

---

### 🔒 `POST /api/next`

**Purpose:** Advances the queue — marks the current patient as done and calls the next waiting patient for a specific date.
**Auth Required:** Yes (Bearer token)

**Query Parameters:**
| Param  | Type         | Required | Description                              |
|--------|--------------|----------|------------------------------------------|
| `date` | `YYYY-MM-DD` | No       | The date queue to advance. Defaults to today. |

**Request Body:** None

**Success Response — patient found (200):**
```json
{
  "success": true,
  "message": "Now serving queue number 4 — Sara Ali.",
  "data": {
    "currentPatient": {
      "id": "uuid-here",
      "name": "Sara Ali",
      "queueNumber": 4,
      "status": "current",
      "bookedAt": "2025-01-15T09:35:00.000Z"
    },
    "queueEmpty": false
  }
}
```

**Success Response — queue empty (200):**
```json
{
  "success": true,
  "message": "No more patients in the waiting queue.",
  "data": {
    "currentPatient": null,
    "queueEmpty": true
  }
}
```

**Error Cases:**
| Status | Code                  | Reason                          |
|--------|-----------------------|---------------------------------|
| 401    | `MISSING_TOKEN`       | No Authorization header         |
| 401    | `EXPIRED`             | Token has expired               |
| 401    | `INVALID_SIGNATURE`   | Token was tampered with         |

---

### 🔒 `POST /api/reset`

**Purpose:** Completely resets the queue — removes all patients, clears the current patient, resets queue numbering to 1.
**Auth Required:** Yes (Bearer token)

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "message": "Queue has been fully reset. All data cleared.",
  "data": {
    "resetAt": "2025-01-15T18:00:00.000Z",
    "resetBy": "admin"
  }
}
```

**Error Cases:**
| Status | Code              | Reason                          |
|--------|-------------------|---------------------------------|
| 401    | `MISSING_TOKEN`   | No Authorization header         |
| 401    | `EXPIRED`         | Token has expired               |

---

### 🔒 `DELETE /api/patient/:id`

**Purpose:** Removes a specific patient from the queue by their UUID (e.g., if they leave before being called).
**Auth Required:** Yes (Bearer token)

**URL Parameter:** `:id` — the patient's UUID

**Example:** `DELETE /api/patient/3f8d7a1c-4b2e-4c9f-a1d2-e3f4a5b6c7d8`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Patient has been removed from the queue.",
  "data": {
    "removedId": "3f8d7a1c-...",
    "removedBy": "admin",
    "removedAt": "2025-01-15T11:00:00.000Z"
  }
}
```

**Error Cases:**
| Status | Code                  | Reason                          |
|--------|-----------------------|---------------------------------|
| 401    | `MISSING_TOKEN`       | No Authorization header         |
| 404    | `PATIENT_NOT_FOUND`   | No patient with that ID exists  |
| 400    | `MISSING_ID`          | ID param is empty               |

---

## 🔄 System Flow Explanation

### Booking Flow (Patient Side)

```
Patient arrives
      │
      ▼
POST /api/book  { name: "Ahmed" }
      │
      ▼
System assigns incremental queue number (e.g., #7)
      │
      ▼
Patient record created with status = "waiting"
      │
      ▼
Patient receives their number → waits
```

### Queue Flow (Doctor Side)

```
Doctor calls POST /api/next
      │
      ├─ Previous "current" patient → status = "done"
      │
      ├─ Next "waiting" patient (lowest queue #) → status = "current"
      │
      └─ Response includes the new current patient
```

### Doctor Control Flow

```
Doctor Dashboard
├── GET /api/queue          → See full queue state
├── POST /api/next          → Call next patient
├── DELETE /api/patient/id  → Remove absent patient
└── POST /api/reset         → End of day / fresh start
```

### Authentication Flow

```
1. Doctor opens login screen
2. POST /api/auth/login { username, password }
3. Server validates credentials
4. Server generates signed JWT (8hr expiry)
5. Frontend stores token in localStorage
6. Every protected request includes: Authorization: Bearer <token>
7. Server verifies signature + expiry on each request
8. On 401 → redirect to login
```

---

## 🖥️ Frontend Integration Examples

### 1. Login Request

```typescript
// login.ts
async function login(username: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error); // e.g. "Invalid username or password."
  }

  // Store token
  localStorage.setItem("clinic_token", json.data.token);
  return json.data;
}
```

---

### 2. Booking Request (Public)

```typescript
// booking.ts
async function bookQueue(patientName: string) {
  const res = await fetch("/api/book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: patientName }),
  });

  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error);
  }

  const { patient } = json.data;
  console.log(`Your queue number is: ${patient.queueNumber}`);
  return patient;
}
```

---

### 3. Protected API Call (with Token)

```typescript
// api.ts — reusable authenticated fetch wrapper
async function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("clinic_token");

  if (!token) {
    window.location.href = "/login"; // redirect if not logged in
    return;
  }

  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  // Handle token expiry
  if (res.status === 401) {
    localStorage.removeItem("clinic_token");
    window.location.href = "/login";
    return;
  }

  return res.json();
}

// Call next patient
async function callNextPatient() {
  const data = await authFetch("/api/next", { method: "POST" });
  console.log("Now serving:", data?.data.currentPatient);
}

// Reset queue
async function resetQueue() {
  const data = await authFetch("/api/reset", { method: "POST" });
  console.log("Reset at:", data?.data.resetAt);
}

// Remove a patient
async function removePatient(patientId: string) {
  const data = await authFetch(`/api/patient/${patientId}`, {
    method: "DELETE",
  });
  console.log("Removed:", data?.data.removedId);
}
```

---

### 4. Polling Queue State (Waiting Room Display)

```typescript
// queueDisplay.ts — poll every 3 seconds for live updates
async function startQueuePolling(onUpdate: (data: unknown) => void) {
  const poll = async () => {
    const res = await fetch("/api/queue");
    const json = await res.json();
    if (json.success) onUpdate(json.data);
  };

  await poll(); // Immediate first fetch
  return setInterval(poll, 3000); // Then every 3 seconds
}
```

---

## 📦 Data Models

### Patient Object

```typescript
interface Patient {
  id: string;           // UUID v4
  name: string;         // Patient's name
  queueNumber: number;  // Incremental (starts from 1)
  status: "waiting" | "current" | "done";
  bookedAt: string;     // ISO 8601 timestamp
}
```

### Queue Snapshot (GET /api/queue response data)

```typescript
interface QueueSnapshot {
  date: string;                 // YYYY-MM-DD — the queried date
  currentPatient: Patient | null;
  waiting: Patient[];           // Sorted by queueNumber asc
  done: Patient[];              // Already served on this date
  totalWaiting: number;         // Count of waiting patients
  totalServedToday: number;     // Count served since last reset for this date
  nextQueueNumber: number;      // What the next booking will get
}
```

---

## 🔒 Security Notes

| Concern | Approach |
|---------|----------|
| Token signing | HMAC-SHA256 via Web Crypto API |
| Secret storage | `.env.local` — never committed to git |
| Token expiry | 8 hours — enforced server-side |
| Credential storage | Hardcoded (replace with DB + bcrypt in production) |
| CORS | Handled by Next.js — configure in `next.config.ts` for production |
| HTTPS | Required in production — use Vercel, Railway, or Nginx |

### Production Upgrade Path

- Replace hardcoded credentials with a database (e.g. Prisma + Postgres)
- Hash passwords with `bcrypt`
- Replace in-memory store with Redis for persistence across restarts
- Add rate limiting to `/api/auth/login` to prevent brute force
- Add refresh token support for sessions longer than 8 hours

---

## 🧪 Testing with cURL

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"1234"}'

# 2. Book a patient
curl -X POST http://localhost:3000/api/book \
  -H "Content-Type: application/json" \
  -d '{"name":"Ahmed Hassan"}'

# 3. Get queue
curl http://localhost:3000/api/queue

# 4. Advance queue (replace TOKEN with value from step 1)
curl -X POST http://localhost:3000/api/next \
  -H "Authorization: Bearer TOKEN"

# 5. Delete patient (replace PATIENT_ID with uuid from step 2)
curl -X DELETE http://localhost:3000/api/patient/PATIENT_ID \
  -H "Authorization: Bearer TOKEN"

# 6. Reset queue
curl -X POST http://localhost:3000/api/reset \
  -H "Authorization: Bearer TOKEN"
```
