# Clinic Management System — Complete Postman Testing Guide

> **Source:** Based strictly on `Api-Doc.md`. Every endpoint, field, status code, and validation rule below is verified from that document. Anything that could not be verified is explicitly labelled **[UNVERIFIED]**.
>
> **Base URL:** `http://localhost:5000/api/v1`
> Save this as a Postman environment variable: `{{base_url}}`

---

## Global Setup in Postman

### Environment Variables (create these before starting)

| Variable | Initial Value | Filled by |
|---|---|---|
| `base_url` | `http://localhost:5000/api/v1` | You (manual) |
| `accessToken` | _(empty)_ | Login response |
| `refreshToken` | _(empty)_ | Login response |
| `patientId` | _(empty)_ | Create Patient response |
| `appointmentId` | _(empty)_ | Create Appointment response |
| `visitId` | _(empty)_ | Create Visit response |
| `queueEntryId` | _(empty)_ | Check-in response |

### Default Auth Header (for all protected requests)

```
Authorization: Bearer {{accessToken}}
Content-Type: application/json
```

### Standard Response Envelope

Every response is wrapped:
```json
{
  "success": true | false,
  "message": "...",
  "data": {} | [] | null,
  "meta": { ... }   // paginated responses only
}
```

---

## Response Status Code Reference

| Code | Meaning |
|---|---|
| `200` | Success (GET, PATCH) |
| `201` | Created (POST) |
| `400` | Validation error / bad request |
| `401` | Missing, invalid, or expired token |
| `403` | Valid token but wrong role, or account deactivated |
| `404` | Resource not found |
| `409` | Conflict (duplicate MRN, phone, time slot, etc.) |
| `500` | Unexpected server error |

---

---

# MODULE 1 — HEALTH

---

## 1.1 GET /health

**Purpose:** Verify the server is running. Call this first before any other test.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/health` |
| Auth | ❌ Not required |
| Roles | None |
| Headers | None |
| Body | None |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:00:00.000Z",
    "uptime": 3600.123,
    "environment": "development"
  }
}
```

**✅ Success indicator:** `"status": "healthy"` in `data`

**Error Responses:** None documented.

**Prerequisites:** None.

---

---

# MODULE 2 — AUTHENTICATION

---

## 2.1 POST /auth/login

**Purpose:** Authenticate a user. Returns the `accessToken` and `refreshToken` you need for every other request.

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/auth/login` |
| Auth | ❌ Not required |
| Roles | None |
| Headers | `Content-Type: application/json` |

**Request Body:**
```json
{
  "email": "doctor@clinic.com",
  "password": "Password@123"
}
```

**Field Rules:**

| Field | Required | Rules |
|---|---|---|
| `email` | Yes | Valid email format, lowercased and trimmed |
| `password` | Yes | Non-empty string |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "clinicId": "uuid",
      "email": "doctor@clinic.com",
      "fullName": "Dr. Ahmed Mohamed",
      "role": "DOCTOR",
      "isActive": true,
      "lastLogin": "2024-01-15T09:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T09:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
    }
  }
}
```

**✅ After success:**
1. Copy `data.tokens.accessToken` → save to `{{accessToken}}`
2. Copy `data.tokens.refreshToken` → save to `{{refreshToken}}`

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Validation failed | Missing or malformed email/password |
| `401` | Invalid email or password | Wrong credentials |
| `403` | Your account has been deactivated. Please contact your administrator | Account disabled |

**Prerequisites:** A user account must already exist in the database (seeded).

---

## 2.2 POST /auth/refresh

**Purpose:** Exchange an expiring or expired refresh token for a new token pair. Use this when you get a `401` on a protected endpoint.

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/auth/refresh` |
| Auth | ❌ Not required |
| Roles | None |
| Headers | `Content-Type: application/json` |

**Request Body:**
```json
{
  "refreshToken": "{{refreshToken}}"
}
```

**Field Rules:**

| Field | Required | Rules |
|---|---|---|
| `refreshToken` | Yes | Non-empty string |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Tokens refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
  }
}
```

**✅ After success:** Replace `{{accessToken}}` and `{{refreshToken}}` with the new values.

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Validation failed | Missing refreshToken field |
| `401` | Invalid or expired refresh token | Token is bad or expired (re-login required) |
| `401` | Invalid token type | You passed an access token instead of a refresh token |
| `403` | Your account has been deactivated | Account disabled |

**Prerequisites:** Must have a valid `refreshToken` from login.

---

## 2.3 POST /auth/logout

**Purpose:** Log out the current user. Discard tokens client-side after this call.

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/auth/logout` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `401` | Missing or invalid access token | Token is absent, malformed, or expired |

**Prerequisites:** Must be logged in.

---

## 2.4 GET /auth/me

**Purpose:** Get the current authenticated user's profile.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/auth/me` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "User retrieved successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "email": "doctor@clinic.com",
    "fullName": "Dr. Ahmed Mohamed",
    "role": "DOCTOR",
    "isActive": true,
    "lastLogin": "2024-01-15T09:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T09:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `401` | Missing or invalid access token | Token problem |
| `403` | Your account has been deactivated | Account disabled |
| `404` | User not found | User was deleted from DB |

**Prerequisites:** Must be logged in.

---

## 2.5 PATCH /auth/change-password

**Purpose:** Change the password of the currently logged-in user.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/auth/change-password` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "currentPassword": "Password@123",
  "newPassword": "NewPassword@456",
  "confirmPassword": "NewPassword@456"
}
```

**Field Rules:**

| Field | Required | Rules |
|---|---|---|
| `currentPassword` | Yes | Non-empty |
| `newPassword` | Yes | Min 8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 number, ≥1 special char, must differ from current |
| `confirmPassword` | Yes | Must exactly match `newPassword` |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": null
}
```

**⚠️ After success:** Your old token is still valid. Login again with the new password to get a fresh token if needed.

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Validation failed | Field rule violation |
| `400` | New password must be different from current password | Same password reused |
| `400` | Passwords do not match | `newPassword` ≠ `confirmPassword` |
| `401` | Current password is incorrect | Wrong existing password |
| `401` | Missing or invalid access token | Token problem |
| `403` | Your account has been deactivated | Account disabled |

**Prerequisites:** Must be logged in.

---

---

# MODULE 3 — PATIENTS

---

## 3.1 POST /patients

**Purpose:** Create a new patient record. Both `mrn` and `phone` must be unique within the clinic.

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/patients` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "mrn": "MRN001",
  "fullName": "Ahmed Mohamed",
  "phone": "01012345678",
  "dateOfBirth": "1990-05-12",
  "gender": "MALE",
  "address": "Cairo, Egypt",
  "notes": "Diabetic patient"
}
```

**Field Rules:**

| Field | Required | Rules |
|---|---|---|
| `mrn` | Yes | Max 50 chars, letters/numbers/hyphens/underscores only |
| `fullName` | Yes | Min 2, max 100 characters |
| `phone` | Yes | Min 7, max 20 chars, valid phone format |
| `dateOfBirth` | Yes | `YYYY-MM-DD`, must be in the past, after 1900-01-01 |
| `gender` | Yes | `MALE`, `FEMALE`, or `OTHER` |
| `address` | No | Max 255 characters |
| `notes` | No | Max 1000 characters |

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Patient created successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "mrn": "MRN001",
    "fullName": "Ahmed Mohamed",
    "phone": "01012345678",
    "dateOfBirth": "1990-05-12T00:00:00.000Z",
    "gender": "MALE",
    "address": "Cairo, Egypt",
    "notes": "Diabetic patient",
    "deletedAt": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z",
    "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" }
  }
}
```

**✅ After success:** Copy `data.id` → save to `{{patientId}}`

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Validation failed | Field rule violation |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `409` | A patient with MRN "MRN001" already exists in this clinic | Duplicate MRN |
| `409` | A patient with phone "01012345678" already exists in this clinic | Duplicate phone |

**Prerequisites:** Must be logged in.

---

## 3.2 GET /patients

**Purpose:** List patients with optional search and filtering. Paginated.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/patients` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `search` | string | — | Case-insensitive search on fullName, phone, MRN |
| `gender` | enum | — | `MALE`, `FEMALE`, `OTHER` |
| `includeDeleted` | boolean | `false` | `true` to include soft-deleted patients |
| `page` | integer | `1` | Min 1 |
| `limit` | integer | `10` | Min 1, max 100 |

**Example URLs:**
```
GET {{base_url}}/patients
GET {{base_url}}/patients?search=Ahmed
GET {{base_url}}/patients?gender=MALE&page=1&limit=20
GET {{base_url}}/patients?includeDeleted=true
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Patients retrieved successfully",
  "data": [ { ...patient objects... } ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

**Sorting:** `createdAt` descending (newest first).

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Invalid query parameters | Bad filter value |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |

**Prerequisites:** Must be logged in.

---

## 3.3 GET /patients/:id

**Purpose:** Get the full profile of a single patient, including visit and appointment history.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/patients/{{patientId}}` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Path Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | The patient's UUID |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Patient retrieved successfully",
  "data": {
    "id": "uuid",
    "mrn": "MRN001",
    "fullName": "Ahmed Mohamed",
    "phone": "01012345678",
    "dateOfBirth": "1990-05-12T00:00:00.000Z",
    "gender": "MALE",
    "address": "Cairo, Egypt",
    "notes": "Diabetic patient",
    "deletedAt": null,
    "visits": [ { "id": "uuid", "visitDate": "...", "chiefComplaint": "...", "diagnosis": "..." } ],
    "appointments": [ { "id": "uuid", "appointmentDate": "...", "appointmentTime": "...", "status": "..." } ]
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Invalid UUID format | `id` is not a valid UUID |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Patient not found | No patient with that ID in this clinic |

**Prerequisites:** A patient must exist (`{{patientId}}`).

---

## 3.4 PATCH /patients/:id

**Purpose:** Partially update a patient record. MRN cannot be changed. At least one field required.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/patients/{{patientId}}` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Path Parameters:**

| Parameter | Type | Required |
|---|---|---|
| `id` | UUID | Yes |

**Request Body (only include fields you want to change):**
```json
{
  "fullName": "Ahmed Mohamed Ali",
  "phone": "01098765432",
  "dateOfBirth": "1990-05-12",
  "gender": "MALE",
  "address": "Alexandria, Egypt",
  "notes": "Updated notes"
}
```

**Mutable Fields:**

| Field | Can Change | Notes |
|---|---|---|
| `mrn` | ❌ No | Cannot be changed after creation |
| `fullName` | ✅ Yes | Min 2, max 100 chars |
| `phone` | ✅ Yes | Must remain unique in clinic |
| `dateOfBirth` | ✅ Yes | `YYYY-MM-DD` |
| `gender` | ✅ Yes | `MALE`, `FEMALE`, `OTHER` |
| `address` | ✅ Yes | Max 255 chars, nullable |
| `notes` | ✅ Yes | Max 1000 chars, nullable |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Patient updated successfully",
  "data": {
    "id": "uuid",
    "mrn": "MRN001",
    "fullName": "Ahmed Mohamed Ali",
    "phone": "01098765432",
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Validation failed | Field rule violation |
| `400` | At least one field must be provided for update | Empty body sent |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Patient not found | Wrong ID |
| `409` | Phone number already exists in this clinic | Duplicate phone |

**Prerequisites:** Patient must exist.

---

## 3.5 DELETE /patients/:id

**Purpose:** Soft-delete a patient. Sets `deletedAt`; record is preserved for audit. The patient will not appear in queries unless `includeDeleted=true`.

| Property | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{base_url}}/patients/{{patientId}}` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Patient deleted successfully",
  "data": null
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Patient is already deleted | Calling delete twice |
| `400` | Invalid UUID format | Bad UUID |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Patient not found | Wrong ID |

**Prerequisites:** Patient must exist and NOT already be deleted.

---

## 3.6 PATCH /patients/:id/restore

**Purpose:** Restore a previously soft-deleted patient. Clears `deletedAt`.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/patients/{{patientId}}/restore` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Patient restored successfully",
  "data": {
    "id": "uuid",
    "fullName": "Ahmed Mohamed",
    "deletedAt": null,
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Patient is not deleted | Patient is active; nothing to restore |
| `400` | Invalid UUID format | Bad UUID |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Patient not found | Wrong ID |

**Prerequisites:** Patient must exist AND be soft-deleted (call DELETE first).

---

---

# MODULE 4 — APPOINTMENTS

---

## Appointment Status Reference

| Status | Description | How to reach it |
|---|---|---|
| `SCHEDULED` | Default on creation | Created via `POST /appointments` |
| `CONFIRMED` | Confirmed by clinic | **No dedicated endpoint** — set manually or via future feature |
| `COMPLETED` | Attended and closed | `PATCH /appointments/:id/complete` |
| `CANCELLED` | Cancelled | `PATCH /appointments/:id/cancel` |
| `NO_SHOW` | Patient didn't show | **No dedicated endpoint** — status value exists for filtering |

**⚠️ Important Notes:**
- `CONFIRMED` and `NO_SHOW` are valid status values in the data model and can be used as query filters, but dedicated endpoints to transition into these statuses are NOT currently implemented.
- Only `SCHEDULED → COMPLETED` and `SCHEDULED → CANCELLED` transitions have dedicated endpoints.
- The `PATCH /appointments/:id` (update date/time) only works on `SCHEDULED` appointments.
- A time-slot conflict check is applied on create and update — no two appointments at the same date+time.

---

## 4.1 POST /appointments

**Purpose:** Book a new appointment. Prevents double-booking the same time slot.

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/appointments` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "patientId": "{{patientId}}",
  "appointmentDate": "2026-09-01",
  "appointmentTime": "09:30",
  "notes": "Follow-up visit"
}
```

**Field Rules:**

| Field | Required | Rules |
|---|---|---|
| `patientId` | Yes | Valid UUID, patient must be active (not deleted) |
| `appointmentDate` | Yes | `YYYY-MM-DD`, cannot be today or in the past |
| `appointmentTime` | Yes | `HH:MM` 24-hour format |
| `notes` | No | Max 1000 characters |

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Appointment created successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "patientId": "uuid",
    "visitId": null,
    "appointmentDate": "2026-09-01T00:00:00.000Z",
    "appointmentTime": "1970-01-01T09:30:00.000Z",
    "status": "SCHEDULED",
    "notes": "Follow-up visit",
    "patient": { "id": "uuid", "fullName": "Ahmed Mohamed", "phone": "01012345678", "mrn": "MRN001" },
    "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

> **Note on `appointmentTime` in response:** The time is returned as a full ISO datetime anchored to `1970-01-01` (e.g., `"1970-01-01T09:30:00.000Z"`). This is expected backend behavior — only the time portion is meaningful.

**✅ After success:** Copy `data.id` → save to `{{appointmentId}}`

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Appointment date cannot be in the past | Date is today or earlier |
| `400` | Validation failed | Field rule violation |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Patient not found or has been deleted | Invalid or deleted patient |
| `409` | An appointment already exists at 09:30 on 2026-09-01 | Time slot taken |

**Prerequisites:** An active (non-deleted) patient must exist.

---

## 4.2 GET /appointments

**Purpose:** List appointments with optional filters. Paginated.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/appointments` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `search` | string | — | Patient fullName, phone, or MRN |
| `status` | enum | — | `SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW` |
| `patientId` | UUID | — | Filter by one patient |
| `date` | string | — | Exact date `YYYY-MM-DD` |
| `fromDate` | string | — | Start of range `YYYY-MM-DD` |
| `toDate` | string | — | End of range `YYYY-MM-DD` |
| `page` | integer | `1` | Min 1 |
| `limit` | integer | `10` | Min 1, max 100 |

**Example URLs:**
```
GET {{base_url}}/appointments
GET {{base_url}}/appointments?status=SCHEDULED
GET {{base_url}}/appointments?patientId={{patientId}}
GET {{base_url}}/appointments?date=2026-09-01
GET {{base_url}}/appointments?fromDate=2026-09-01&toDate=2026-09-30
```

**Sorting:** `appointmentDate` ascending, then `appointmentTime` ascending.

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Appointments retrieved successfully",
  "data": [ { ...appointment objects... } ],
  "meta": { "total": 25, "page": 1, "limit": 10, "totalPages": 3, "hasNextPage": true, "hasPrevPage": false }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid query parameters |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 4.3 GET /appointments/:id

**Purpose:** Get full details of one appointment, including linked visit (if any).

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/appointments/{{appointmentId}}` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Path Parameters:**

| Parameter | Type | Required |
|---|---|---|
| `id` | UUID | Yes |

**Expected Response (200):** Full appointment object including nested `patient` and `visit` (if linked).

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid UUID format |
| `401` | Unauthorized |
| `403` | Insufficient role |
| `404` | Appointment not found |

---

## 4.4 PATCH /appointments/:id

**Purpose:** Reschedule a `SCHEDULED` appointment's date, time, or notes. Validates for time-slot conflicts.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/appointments/{{appointmentId}}` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Path Parameters:**

| Parameter | Type | Required |
|---|---|---|
| `id` | UUID | Yes |

**Request Body (at least one field required):**
```json
{
  "appointmentDate": "2026-09-05",
  "appointmentTime": "10:00",
  "notes": "Rescheduled by patient request"
}
```

**Mutable Fields:**

| Field | Can Change | Notes |
|---|---|---|
| `patientId` | ❌ No | Cannot be changed |
| `status` | ❌ No | Use `/cancel` or `/complete` endpoints |
| `appointmentDate` | ✅ Yes | `YYYY-MM-DD`, cannot be in the past |
| `appointmentTime` | ✅ Yes | `HH:MM` |
| `notes` | ✅ Yes | Max 1000 chars, nullable |

**⚠️ Only `SCHEDULED` appointments can be updated.** Attempting to update a `COMPLETED` or `CANCELLED` appointment returns `400`.

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Appointment updated successfully",
  "data": {
    "id": "uuid",
    "appointmentDate": "2026-09-05T00:00:00.000Z",
    "appointmentTime": "1970-01-01T10:00:00.000Z",
    "status": "SCHEDULED",
    "notes": "Rescheduled by patient request",
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Validation failed | Field rule violation |
| `400` | At least one field must be provided for update | Empty body |
| `400` | Only scheduled appointments can be updated | Wrong status |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Appointment not found | Wrong ID |
| `409` | New time slot is already booked | Conflict at new time |

---

## 4.5 PATCH /appointments/:id/cancel

**Purpose:** Cancel a `SCHEDULED` or `CONFIRMED` appointment. Frees the time slot.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/appointments/{{appointmentId}}/cancel` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Status Transition:** `SCHEDULED → CANCELLED` or `CONFIRMED → CANCELLED`

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Appointment cancelled successfully",
  "data": {
    "id": "uuid",
    "status": "CANCELLED",
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Cannot transition appointment from "COMPLETED" to "CANCELLED" | Already completed |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Appointment not found | Wrong ID |

**Prerequisites:** Appointment must be in `SCHEDULED` or `CONFIRMED` status.

---

## 4.6 PATCH /appointments/:id/complete

**Purpose:** Mark a `SCHEDULED` appointment as `COMPLETED`.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/appointments/{{appointmentId}}/complete` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Status Transition:** `SCHEDULED → COMPLETED`

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Appointment completed successfully",
  "data": {
    "id": "uuid",
    "status": "COMPLETED",
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Cannot transition appointment from "CANCELLED" to "COMPLETED" | Already cancelled |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Appointment not found | Wrong ID |

**Prerequisites:** Appointment must be in `SCHEDULED` status.

---

---

# MODULE 5 — VISITS

> **Role restriction:** Only `DOCTOR` can create, update, or delete visits. `RECEPTIONIST` can only read.

---

## 5.1 POST /visits

**Purpose:** Create a new clinical visit record for a patient. Optionally links to an appointment and/or queue entry. Only one visit per patient per day is allowed.

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/visits` |
| Auth | ✅ Required |
| Roles | **DOCTOR only** |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "patientId": "{{patientId}}",
  "appointmentId": "{{appointmentId}}",
  "queueEntryId": "{{queueEntryId}}",
  "visitDate": "2026-08-10",
  "chiefComplaint": "Headache and fever",
  "diagnosis": "Tension headache",
  "treatment": "Rest and paracetamol",
  "prescription": "Paracetamol 500mg",
  "notes": "Patient looked fatigued"
}
```

**Field Rules:**

| Field | Required | Rules |
|---|---|---|
| `patientId` | Yes | Valid UUID, patient must be active |
| `appointmentId` | No | Must be a `SCHEDULED` appointment belonging to this patient |
| `queueEntryId` | No | Must be an unlinked queue entry |
| `visitDate` | No | `YYYY-MM-DD`, defaults to today |
| `chiefComplaint` | No | Max 500 characters |
| `diagnosis` | No | Max 1000 characters |
| `treatment` | No | Max 1000 characters |
| `prescription` | No | Max 1000 characters |
| `notes` | No | Max 1000 characters |

**Timestamp Fields in Response (read-only, set by system):**

| Field | Description |
|---|---|
| `startedAt` | When the visit/consultation actually started. Set by linking queue entry via `/queue/:id/start`. |
| `completedAt` | When the visit was completed. |
| `followUpDate` | Next follow-up date. Set via `PATCH /visits/:id`. |

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Visit created successfully",
  "data": {
    "id": "uuid",
    "patientId": "uuid",
    "visitDate": "2026-08-10T00:00:00.000Z",
    "chiefComplaint": "Headache and fever",
    "diagnosis": "Tension headache",
    "treatment": "Rest and paracetamol",
    "prescription": "Paracetamol 500mg",
    "notes": "Patient looked fatigued",
    "startedAt": null,
    "completedAt": null,
    "followUpDate": null,
    "patient": { "id": "uuid", "fullName": "Ahmed Mohamed", "phone": "01012345678", "mrn": "MRN001" },
    "appointment": { "id": "uuid", "status": "SCHEDULED", ... },
    "queueEntry": { "id": "uuid", "queueNumber": 5, "status": "IN_PROGRESS", "checkedInAt": "...", "calledAt": "...", "startedAt": null, "servedAt": null }
  }
}
```

**✅ After success:** Copy `data.id` → save to `{{visitId}}`

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Validation failed | Field rule violation |
| `401` | Unauthorized | Token problem |
| `403` | RECEPTIONIST cannot create visits | Wrong role |
| `404` | Patient not found or has been deleted | Invalid patient |
| `404` | Appointment not found or does not belong to this patient | Invalid appointment link |
| `404` | Queue entry not found | Invalid queue entry |
| `409` | Patient already has a visit record for this date | One visit per patient per day |
| `409` | Appointment already has a visit linked to it | Appointment already used |
| `409` | Queue entry already has a visit linked to it | Queue entry already used |

**Prerequisites:** Active patient required. Optional: a `SCHEDULED` appointment and/or active queue entry.

---

## 5.2 GET /visits

**Purpose:** List visits with optional search, filters, and sorting. Paginated.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/visits` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `search` | string | — | Patient fullName, phone, MRN |
| `patientId` | UUID | — | Filter by patient |
| `createdById` | UUID | — | Filter by doctor who created the visit |
| `date` | string | — | Exact date `YYYY-MM-DD` |
| `fromDate` | string | — | Range start `YYYY-MM-DD` |
| `toDate` | string | — | Range end `YYYY-MM-DD` |
| `sortBy` | enum | `visitDate` | `visitDate` or `createdAt` |
| `sortOrder` | enum | `desc` | `asc` or `desc` |
| `page` | integer | `1` | Min 1 |
| `limit` | integer | `10` | Min 1, max 100 |

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid query parameters |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 5.3 GET /visits/:id

**Purpose:** Get full details of a single visit including linked appointment and queue entry.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/visits/{{visitId}}` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Expected Response (200):** Full visit object including `startedAt`, `completedAt`, `followUpDate`, and nested `appointment` and `queueEntry`.

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid UUID format |
| `401` | Unauthorized |
| `403` | Insufficient role |
| `404` | Visit not found |

---

## 5.4 GET /patients/:patientId/visits

**Purpose:** Get all visits for a specific patient. Same query parameters as `GET /visits`.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/patients/{{patientId}}/visits` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:** Same as `GET /visits` (search, date, fromDate, toDate, sortBy, sortOrder, page, limit).

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Patient visits retrieved successfully",
  "data": [],
  "meta": { "total": 5, "page": 1, "limit": 10, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid UUID format |
| `401` | Unauthorized |
| `403` | Insufficient role |
| `404` | Patient not found |

---

## 5.5 PATCH /visits/:id

**Purpose:** Update a visit's clinical fields or schedule a follow-up date. At least one field required.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/visits/{{visitId}}` |
| Auth | ✅ Required |
| Roles | **DOCTOR only** |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Request Body (at least one field required):**
```json
{
  "chiefComplaint": "Updated complaint",
  "diagnosis": "Updated diagnosis",
  "treatment": "Updated treatment",
  "prescription": "Updated prescription",
  "notes": "Updated notes",
  "followUpDate": "2026-09-15"
}
```

**Mutable Fields:**

| Field | Can Change | Notes |
|---|---|---|
| `patientId` | ❌ No | Cannot be changed |
| `visitDate` | ❌ No | Cannot be changed |
| `chiefComplaint` | ✅ Yes | Max 500 chars, nullable |
| `diagnosis` | ✅ Yes | Max 1000 chars, nullable |
| `treatment` | ✅ Yes | Max 1000 chars, nullable |
| `prescription` | ✅ Yes | Max 1000 chars, nullable |
| `notes` | ✅ Yes | Max 1000 chars, nullable |
| `followUpDate` | ✅ Yes | `YYYY-MM-DD`, nullable |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Visit updated successfully",
  "data": {
    "id": "uuid",
    "diagnosis": "Updated diagnosis",
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | At least one field must be provided for update | Empty body |
| `400` | Validation failed | Field rule violation |
| `401` | Unauthorized | Token problem |
| `403` | RECEPTIONIST cannot update visits | Wrong role |
| `404` | Visit not found | Wrong ID |

---

## 5.6 DELETE /visits/:id

**Purpose:** Permanently delete a visit. Unlinks related appointments and queue entries.

| Property | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{base_url}}/visits/{{visitId}}` |
| Auth | ✅ Required |
| Roles | **DOCTOR only** |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Visit deleted successfully",
  "data": null
}
```

**⚠️ This is a HARD DELETE — the record is permanently removed.**

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Invalid UUID format | Bad UUID |
| `401` | Unauthorized | Token problem |
| `403` | RECEPTIONIST cannot delete visits | Wrong role |
| `404` | Visit not found | Wrong ID |

---

---

# MODULE 6 — QUEUE

---

## Queue State Machine

```
                    ┌──────────────────────────────────────────┐
                    ▼                                          │
WAITING ──[call-next / recall]──► IN_PROGRESS ──[serve]──► SERVED
   ▲                                    │
   └─────────────[skip]─────────────────┘
   │
   └────────────────────────────────────────────────────────► CANCELLED

IN_PROGRESS ────────────────────────────────────────────────► CANCELLED
```

## Queue Timestamp Sequence

| Timestamp | Set by | Meaning |
|---|---|---|
| `checkedInAt` | `POST /queue/check-in` | When the patient arrived and registered in the queue |
| `calledAt` | `POST /queue/call-next` or `PATCH /queue/:id/recall` | When the patient was summoned to the room |
| `startedAt` | `PATCH /queue/:id/start` | When the doctor actually began the consultation (distinct from being called) |
| `servedAt` | `PATCH /queue/:id/serve` | When the encounter was marked complete |

---

## 6.1 POST /queue/check-in

**Purpose:** Check a patient into today's queue. Creates both a `Visit` record and a `QueueEntry` atomically. Optionally links an existing appointment. The queue number is assigned automatically (next available).

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/queue/check-in` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "patientId": "{{patientId}}",
  "appointmentId": "{{appointmentId}}",
  "chiefComplaint": "Headache and fever",
  "notes": "Patient looks pale"
}
```

**Field Rules:**

| Field | Required | Rules |
|---|---|---|
| `patientId` | Yes | Active non-deleted patient |
| `appointmentId` | No | Must be `SCHEDULED` and belong to this patient |
| `chiefComplaint` | No | Max 500 characters |
| `notes` | No | Max 1000 characters |

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Patient checked in successfully",
  "data": {
    "id": "uuid",
    "visitId": "uuid",
    "queueNumber": 5,
    "isReserved": false,
    "reservedFor": null,
    "status": "WAITING",
    "checkedInAt": "2024-01-15T09:00:00.000Z",
    "calledAt": null,
    "startedAt": null,
    "servedAt": null,
    "visit": {
      "id": "uuid",
      "chiefComplaint": "Headache and fever",
      "patient": { "id": "uuid", "fullName": "Ahmed Mohamed", "phone": "01012345678", "mrn": "MRN001" }
    }
  }
}
```

**✅ After success:**
- Copy `data.id` → save to `{{queueEntryId}}`
- Copy `data.visitId` → you can also update `{{visitId}}` with this if not set

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Validation failed | Field rule violation |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Patient not found or has been deleted | Invalid patient |
| `404` | Appointment not found, does not belong to this patient, or is not scheduled | Invalid appointment |
| `409` | Patient already has an active queue entry for today | Patient already in queue |
| `409` | Appointment already has a visit linked to it | Appointment already used |

**Prerequisites:** Active patient required.

---

## 6.2 POST /queue/reserve

**Purpose:** Manually reserve one of the first three queue numbers (1, 2, or 3) for a VIP or priority patient. Must be called before normal check-ins claim those numbers.

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/queue/reserve` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "queueNumber": 1,
  "reservedFor": "VIP Patient Name",
  "notes": "Director referral"
}
```

**Field Rules:**

| Field | Required | Rules |
|---|---|---|
| `queueNumber` | Yes | Must be `1`, `2`, or `3` only |
| `reservedFor` | Yes | Min 1, max 100 characters |
| `notes` | No | Max 1000 characters |

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Queue slot reserved successfully",
  "data": {
    "id": "uuid",
    "queueNumber": 1,
    "isReserved": true,
    "reservedFor": "VIP Patient Name",
    "status": "WAITING",
    "checkedInAt": null,
    "calledAt": null,
    "startedAt": null,
    "servedAt": null,
    "visit": null
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Queue number must be 1, 2, or 3 | Number out of allowed range |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `409` | Queue number 1 is already taken for today | Slot already reserved or checked in |

---

## 6.3 POST /queue/call-next

**Purpose:** Call the next `WAITING` patient to `IN_PROGRESS`. Fails if another patient is currently `IN_PROGRESS`.

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/queue/call-next` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Status Transition:** `WAITING → IN_PROGRESS` (sets `calledAt`)

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Next patient called successfully",
  "data": {
    "id": "uuid",
    "queueNumber": 4,
    "status": "IN_PROGRESS",
    "calledAt": "2024-01-15T10:30:00.000Z",
    "startedAt": null,
    "visit": {
      "id": "uuid",
      "chiefComplaint": "Fever",
      "patient": { "id": "uuid", "fullName": "Mohamed Hassan", "phone": "01033334444", "mrn": "MRN004" }
    }
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | No waiting patients in the queue | Queue is empty |
| `409` | Patient #3 is currently being served. Please complete or cancel before calling next. | Another patient is IN_PROGRESS |

**Prerequisites:** At least one `WAITING` entry in today's queue. No patient currently `IN_PROGRESS`.

---

## 6.4 POST /queue/reset

**Purpose:** Cancel all `WAITING` and `IN_PROGRESS` entries for today. `SERVED` and `CANCELLED` entries are unaffected. Use with caution.

| Property | Value |
|---|---|
| Method | `POST` |
| URL | `{{base_url}}/queue/reset` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Queue reset successfully. 8 entries cancelled.",
  "data": { "cancelled": 8 }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 6.5 GET /queue

**Purpose:** List queue entries. Defaults to today's queue. Paginated.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/queue` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | enum | — | `WAITING`, `IN_PROGRESS`, `SERVED`, `CANCELLED` |
| `date` | string | Today | `YYYY-MM-DD` |
| `page` | integer | `1` | Min 1 |
| `limit` | integer | `20` | Min 1, max 100 |

**Sorting:** `queueNumber` ascending.

**Example URLs:**
```
GET {{base_url}}/queue
GET {{base_url}}/queue?status=WAITING
GET {{base_url}}/queue?date=2026-08-10
```

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid date format |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 6.6 GET /queue/status

**Purpose:** Real-time snapshot of today's queue: currently serving patient, next patient, and counts.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/queue/status` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |
| Query Params | None |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Queue status retrieved successfully",
  "data": {
    "currentlyServing": { "id": "uuid", "queueNumber": 3, "status": "IN_PROGRESS", "checkedInAt": "...", "calledAt": "...", "startedAt": null, "visit": { ... } },
    "nextWaiting": { "id": "uuid", "queueNumber": 4, "status": "WAITING", "visit": { ... } },
    "waitingCount": 8,
    "servedCount": 2
  }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 6.7 GET /queue/statistics

**Purpose:** Aggregated queue statistics for a given day. Includes counts and average wait/serve times.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/queue/statistics` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `date` | string | Today | `YYYY-MM-DD` |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Queue statistics retrieved successfully",
  "data": {
    "date": "2024-01-15",
    "total": 15,
    "waiting": 8,
    "inProgress": 1,
    "served": 5,
    "cancelled": 1,
    "averageWaitTimeMinutes": 12.5,
    "averageServeTimeMinutes": 8.3
  }
}
```

**Average Time Formulas:**

| Field | Formula | Notes |
|---|---|---|
| `averageWaitTimeMinutes` | `startedAt − checkedInAt` | Only SERVED entries with both fields set |
| `averageServeTimeMinutes` | `servedAt − startedAt` | Only SERVED entries with both fields set |

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid date format |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 6.8 GET /queue/:id

**Purpose:** Get full details of a single queue entry.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/queue/{{queueEntryId}}` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Expected Response (200):** Full queue entry with all timestamps and nested visit/patient.

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid UUID format |
| `401` | Unauthorized |
| `403` | Insufficient role |
| `404` | Queue entry not found |

---

## 6.9 PATCH /queue/:id/serve

**Purpose:** Mark an `IN_PROGRESS` queue entry as `SERVED`. Sets `servedAt`.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/queue/{{queueEntryId}}/serve` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Status Transition:** `IN_PROGRESS → SERVED` (sets `servedAt`)

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Patient marked as served successfully",
  "data": {
    "id": "uuid",
    "queueNumber": 3,
    "status": "SERVED",
    "calledAt": "2024-01-15T10:15:00.000Z",
    "startedAt": "2024-01-15T10:17:00.000Z",
    "servedAt": "2024-01-15T10:28:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Cannot transition queue entry from "WAITING" to "SERVED" | Must be IN_PROGRESS first |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Queue entry not found | Wrong ID |

**Prerequisites:** Queue entry must be `IN_PROGRESS`.

---

## 6.10 PATCH /queue/:id/start

**Purpose:** Start the consultation for an `IN_PROGRESS` entry. Sets `startedAt`. Does **not** change `status` — entry stays `IN_PROGRESS`.

> This records when the doctor actually began treating the patient, separate from `calledAt` (when they were summoned).

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/queue/{{queueEntryId}}/start` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Effect:** Sets `startedAt` on the queue entry. Status remains `IN_PROGRESS`.

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Consultation started successfully",
  "data": {
    "id": "uuid",
    "queueNumber": 3,
    "status": "IN_PROGRESS",
    "startedAt": "2024-01-15T10:17:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Only in-progress queue entries can be started | Must be IN_PROGRESS |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Queue entry not found | Wrong ID |

**Prerequisites:** Queue entry must be `IN_PROGRESS` (call `/call-next` first).

---

## 6.11 PATCH /queue/:id/skip

**Purpose:** Send an `IN_PROGRESS` patient back to `WAITING` status (e.g., patient temporarily unavailable).

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/queue/{{queueEntryId}}/skip` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Status Transition:** `IN_PROGRESS → WAITING` (clears `calledAt`)

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Patient skipped successfully",
  "data": {
    "id": "uuid",
    "queueNumber": 3,
    "status": "WAITING",
    "calledAt": null
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Cannot transition queue entry from "WAITING" to "WAITING" | Must be IN_PROGRESS |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Queue entry not found | Wrong ID |

---

## 6.12 PATCH /queue/:id/recall

**Purpose:** Directly call a specific `WAITING` patient to `IN_PROGRESS` (bypass the automatic call-next order). Fails if another patient is already `IN_PROGRESS`.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/queue/{{queueEntryId}}/recall` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Status Transition:** `WAITING → IN_PROGRESS` (sets `calledAt`)

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Patient recalled successfully",
  "data": {
    "id": "uuid",
    "queueNumber": 3,
    "status": "IN_PROGRESS",
    "calledAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Only waiting patients can be recalled | Must be WAITING |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Queue entry not found | Wrong ID |
| `409` | Patient #2 is currently being served. Please complete or cancel before recalling. | Another patient IN_PROGRESS |

---

## 6.13 PATCH /queue/:id/cancel

**Purpose:** Cancel a `WAITING` or `IN_PROGRESS` queue entry. Unlinks related `SCHEDULED` appointments.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/queue/{{queueEntryId}}/cancel` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Status Transition:** `WAITING → CANCELLED` or `IN_PROGRESS → CANCELLED`

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Queue entry cancelled successfully",
  "data": {
    "id": "uuid",
    "queueNumber": 5,
    "status": "CANCELLED"
  }
}
```

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | Cannot transition queue entry from "SERVED" to "CANCELLED" | Already served |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Queue entry not found | Wrong ID |

---

---

# MODULE 7 — DASHBOARD

> All dashboard endpoints are read-only, require auth, and are accessible by both DOCTOR and RECEPTIONIST.

---

## 7.1 GET /dashboard/overview

**Purpose:** High-level clinic statistics: total patients, appointments, visits, and today's queue summary.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/dashboard/overview` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `date` | string | Today | Scopes today's counts to this date `YYYY-MM-DD` |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Overview retrieved successfully",
  "data": {
    "totalPatients": 250,
    "activePatients": 245,
    "deletedPatients": 5,
    "totalAppointments": 1200,
    "todayAppointments": 18,
    "scheduledAppointments": 320,
    "completedAppointments": 850,
    "cancelledAppointments": 30,
    "totalVisits": 980,
    "todayVisits": 12,
    "waitingPatients": 8,
    "currentlyServing": 1,
    "servedToday": 5,
    "cancelledToday": 1
  }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid date format |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 7.2 GET /dashboard/today

**Purpose:** Complete snapshot of today's activity: appointments, visits, and queue statistics.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/dashboard/today` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default |
|---|---|---|
| `date` | string | Today (`YYYY-MM-DD`) |

**Expected Response (200):** Returns `date`, nested `appointments` object (total, scheduled, completed, cancelled + list), `visits` object (total + list), and `queue` stats.

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid date format |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 7.3 GET /dashboard/queue

**Purpose:** Live queue dashboard with currently serving patient, next patient, full waiting list, and statistics.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/dashboard/queue` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `date` | string | Today | `YYYY-MM-DD` |
| `page` | integer | `1` | Page number for the waiting list |
| `limit` | integer | `20` | Max 100 |

**Expected Response (200):** Returns `date`, `currentlyServing`, `nextWaiting`, `waitingList` array, and `statistics` object.

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid date format |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 7.4 GET /dashboard/appointments

**Purpose:** Upcoming, completed, and cancelled appointments for a date range with summary counts.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/dashboard/appointments` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `fromDate` | string | Today | `YYYY-MM-DD` |
| `toDate` | string | End of month | `YYYY-MM-DD` |
| `page` | integer | `1` | |
| `limit` | integer | `10` | Max 100 |

**Expected Response (200):** Returns `upcoming`, `completed`, `cancelled` lists and `summary` with totals.

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid date format |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 7.5 GET /dashboard/patients

**Purpose:** Patient statistics: recently registered, recently visited, gender breakdown, and counts.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/dashboard/patients` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | |
| `limit` | integer | `10` | Max 100 |

**Expected Response (200):** Returns `totalActive`, `totalDeleted`, `recentlyRegistered`, `recentlyVisited`, `genderBreakdown`.

**Error Responses:**

| Status | Message |
|---|---|
| `400` | Invalid query parameters |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

## 7.6 GET /dashboard/analytics

**Purpose:** Time-series analytics: visits per day, appointments per day, patients registered per month, queue metrics, and appointment metrics.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/dashboard/analytics` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `fromDate` | string | 30 days ago | `YYYY-MM-DD` |
| `toDate` | string | Today | `YYYY-MM-DD` |

**Expected Response (200):** Returns `period`, `visitsPerDay`, `appointmentsPerDay`, `patientsRegisteredPerMonth`, `queueMetrics`, `appointmentMetrics`.

**Error Responses:**

| Status | Message |
|---|---|
| `400` | fromDate must be before or equal to toDate |
| `400` | Invalid date format |
| `401` | Unauthorized |
| `403` | Insufficient role |

---

---

# MODULE 8 — CLINIC SETTINGS

---

## 8.1 GET /clinic-settings

**Purpose:** Get the clinic's configuration including working hours, appointment slot duration, and grace/delay settings. Auto-creates default settings if none exist.

| Property | Value |
|---|---|
| Method | `GET` |
| URL | `{{base_url}}/clinic-settings` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}` |
| Body | None |

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Clinic settings retrieved successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "workingHours": {
      "monday":    { "open": "09:00", "close": "17:00", "isOpen": true },
      "tuesday":   { "open": "09:00", "close": "17:00", "isOpen": true },
      "wednesday": { "open": "09:00", "close": "17:00", "isOpen": true },
      "thursday":  { "open": "09:00", "close": "17:00", "isOpen": true },
      "friday":    { "open": "09:00", "close": "17:00", "isOpen": true },
      "saturday":  { "open": "09:00", "close": "14:00", "isOpen": false },
      "sunday":    { "open": "09:00", "close": "14:00", "isOpen": false }
    },
    "maxPatientsPerDay": 50,
    "appointmentDuration": 30,
    "gracePeriod": 15,
    "delayThreshold": 20,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z",
    "clinic": {
      "id": "uuid",
      "name": "Al Shifa Clinic",
      "phone": "0223456789",
      "email": "contact@alshifa.com",
      "address": "Cairo, Egypt",
      "isActive": true
    }
  }
}
```

**Settings Fields Explained:**

| Field | Description |
|---|---|
| `appointmentDuration` | Duration in minutes of each appointment slot. Default: `30` |
| `gracePeriod` | Minutes of late-arrival tolerance. Default: `15` |
| `delayThreshold` | Minutes before a delay is flagged. Default: `20` |
| `maxPatientsPerDay` | Daily patient cap. Default: `50` |

**Error Responses:**

| Status | Message |
|---|---|
| `401` | Unauthorized |
| `403` | Insufficient role |
| `404` | Clinic not found |

---

## 8.2 PATCH /clinic-settings

**Purpose:** Update clinic configuration and/or clinic info. At least one field required. All updates are applied transactionally.

| Property | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{base_url}}/clinic-settings` |
| Auth | ✅ Required |
| Roles | DOCTOR, RECEPTIONIST |
| Headers | `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` |

**Request Body (all fields optional, at least one required):**
```json
{
  "name": "Al Shifa Medical Center",
  "phone": "0223456789",
  "email": "info@alshifa.com",
  "address": "Cairo, Egypt",
  "maxPatientsPerDay": 60,
  "appointmentDuration": 30,
  "gracePeriod": 15,
  "delayThreshold": 20,
  "workingHours": {
    "monday":    { "open": "08:00", "close": "18:00", "isOpen": true },
    "tuesday":   { "open": "08:00", "close": "18:00", "isOpen": true },
    "wednesday": { "open": "08:00", "close": "18:00", "isOpen": true },
    "thursday":  { "open": "08:00", "close": "18:00", "isOpen": true },
    "friday":    { "open": "08:00", "close": "18:00", "isOpen": true },
    "saturday":  { "open": "09:00", "close": "14:00", "isOpen": true },
    "sunday":    { "open": "09:00", "close": "14:00", "isOpen": false }
  }
}
```

**Field Rules:**

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | No | Min 2, max 100 chars |
| `phone` | string | No | Min 7, max 20 chars, valid phone format, nullable |
| `email` | string | No | Valid email, max 100 chars, nullable |
| `address` | string | No | Min 1, max 255 chars, nullable |
| `maxPatientsPerDay` | integer | No | Min 1, max 1000 |
| `appointmentDuration` | integer | No | Duration in minutes per slot |
| `gracePeriod` | integer | No | Late-arrival grace in minutes |
| `delayThreshold` | integer | No | Delay flag threshold in minutes |
| `workingHours` | object | No | Must include ALL 7 days if provided; each day needs `open` (HH:MM), `close` (HH:MM), `isOpen` (boolean) |

**⚠️ If `workingHours` is provided, you MUST include all 7 days (monday through sunday).**

**Expected Response (200):** Full updated settings object (same structure as GET).

**Error Responses:**

| Status | Message | Meaning |
|---|---|---|
| `400` | At least one field must be provided for update | Empty body |
| `400` | Validation failed | Field rule violation |
| `400` | Invalid email address | Bad email format |
| `400` | Invalid phone number format | Bad phone format |
| `400` | Max patients per day must be at least 1 | Value < 1 |
| `400` | Open time must be in HH:MM format | Bad time format |
| `401` | Unauthorized | Token problem |
| `403` | Insufficient role | Wrong role |
| `404` | Clinic not found | Clinic record missing |

---

---

# TESTING WORKFLOWS

---

## WORKFLOW A — Full Appointment Lifecycle

> Use this workflow to test the appointment-based flow from login through completion.

```
Step 1: Login
Step 2: Create Patient
Step 3: Create Appointment
Step 4: View Appointment
Step 5: Reschedule Appointment (optional)
Step 6: Complete Appointment
Step 7: Create Visit (DOCTOR role, linked to appointment)
Step 8: Update Visit / Set Follow-up
Step 9: View Patient Profile (should show appointment + visit)
```

### Step-by-step:

**Step 1 — Login**
- `POST /auth/login` with `{ email, password }`
- ✅ Save `data.tokens.accessToken` → `{{accessToken}}`
- ✅ Save `data.tokens.refreshToken` → `{{refreshToken}}`

**Step 2 — Create Patient**
- `POST /patients` with full patient body
- ✅ Status: `201`
- ✅ Save `data.id` → `{{patientId}}`

**Step 3 — Create Appointment**
- `POST /appointments` with `{ patientId: "{{patientId}}", appointmentDate: "<future date>", appointmentTime: "09:30" }`
- ✅ Status: `201`, `data.status` = `"SCHEDULED"`
- ✅ Save `data.id` → `{{appointmentId}}`

**Step 4 — View Appointment**
- `GET /appointments/{{appointmentId}}`
- ✅ Status: `200`, `data.visitId` should be `null` (no visit yet)

**Step 5 — Reschedule (optional)**
- `PATCH /appointments/{{appointmentId}}` with `{ appointmentDate: "<different date>", appointmentTime: "10:00" }`
- ✅ Status: `200`, `data.status` still `"SCHEDULED"`
- ⚠️ Fail test: try the same time as another existing appointment → expect `409`

**Step 6 — Complete Appointment**
- `PATCH /appointments/{{appointmentId}}/complete`
- ✅ Status: `200`, `data.status` = `"COMPLETED"`

**Step 7 — Create Visit (must use DOCTOR account)**
- `POST /visits` with `{ patientId: "{{patientId}}", appointmentId: "{{appointmentId}}", chiefComplaint: "...", diagnosis: "..." }`
- ⚠️ `appointmentId` must reference a `SCHEDULED` appointment. Since we completed it in step 6, create a NEW appointment first for this step, OR skip the `appointmentId` link.
- ✅ Status: `201`
- ✅ Save `data.id` → `{{visitId}}`

**Step 8 — Update Visit with Follow-up**
- `PATCH /visits/{{visitId}}` with `{ followUpDate: "<future date>", diagnosis: "Final diagnosis" }`
- ✅ Status: `200`

**Step 9 — View Patient Profile**
- `GET /patients/{{patientId}}`
- ✅ Response `data.appointments` should list the completed appointment
- ✅ Response `data.visits` should list the visit

---

## WORKFLOW B — Full Queue Lifecycle

> Use this workflow to test the daily queue flow from check-in to served.

```
Step 1:  Login
Step 2:  Create Patient
Step 3:  Check-in Patient to Queue
Step 4:  View Queue
Step 5:  Call Next Patient
Step 6:  Start Consultation
Step 7:  Update Visit (add diagnosis)
Step 8:  Serve Patient (mark complete)
Step 9:  View Queue Statistics
```

### Step-by-step:

**Step 1 — Login**
- `POST /auth/login`
- ✅ Save `accessToken`

**Step 2 — Create Patient**
- `POST /patients` with full body
- ✅ Save `data.id` → `{{patientId}}`

**Step 3 — Check-in Patient**
- `POST /queue/check-in` with `{ patientId: "{{patientId}}", chiefComplaint: "Headache and fever" }`
- ✅ Status: `201`, `data.status` = `"WAITING"`, `data.checkedInAt` is set
- ✅ Save `data.id` → `{{queueEntryId}}`
- ✅ Save `data.visitId` → `{{visitId}}`

**Step 4 — View Queue**
- `GET /queue`
- ✅ The checked-in patient should appear with status `"WAITING"`

**Step 5 — Call Next Patient**
- `POST /queue/call-next`
- ✅ Status: `200`, `data.status` = `"IN_PROGRESS"`, `data.calledAt` is set, `data.startedAt` is `null`
- ✅ Confirm the queueEntryId matches `{{queueEntryId}}`

**Step 5b — Verify Queue Status**
- `GET /queue/status`
- ✅ `data.currentlyServing.id` should equal `{{queueEntryId}}`
- ✅ `data.currentlyServing.startedAt` should be `null` (not yet started)

**Step 6 — Start Consultation**
- `PATCH /queue/{{queueEntryId}}/start`
- ✅ Status: `200`, `data.status` still `"IN_PROGRESS"`, `data.startedAt` is now set (not null)

**Step 7 — Update Visit (DOCTOR role required)**
- `PATCH /visits/{{visitId}}` with `{ diagnosis: "Tension headache", treatment: "Rest and paracetamol", prescription: "Paracetamol 500mg" }`
- ✅ Status: `200`

**Step 8 — Serve Patient**
- `PATCH /queue/{{queueEntryId}}/serve`
- ✅ Status: `200`, `data.status` = `"SERVED"`, `data.servedAt` is set

**Step 9 — View Statistics**
- `GET /queue/statistics`
- ✅ `data.served` count should have increased
- ✅ `data.averageWaitTimeMinutes` and `data.averageServeTimeMinutes` should be populated (if `checkedInAt` and `startedAt` were both set)

---

## WORKFLOW C — Queue Skip & Recall

> Test the skip-and-recall flow for when a called patient isn't ready.

**Step 1 — Check-in 2 patients** (two separate patients)
- `POST /queue/check-in` for patient A → note `queueEntryId_A`
- `POST /queue/check-in` for patient B → note `queueEntryId_B`

**Step 2 — Call Next (calls patient A)**
- `POST /queue/call-next`
- ✅ Patient A is `IN_PROGRESS`

**Step 3 — Skip Patient A**
- `PATCH /queue/{{queueEntryId_A}}/skip`
- ✅ Patient A returns to `WAITING`

**Step 4 — Call Next (now calls patient B)**
- `POST /queue/call-next`
- ✅ Patient B is `IN_PROGRESS`

**Step 5 — Recall Patient A (should fail — B is IN_PROGRESS)**
- `PATCH /queue/{{queueEntryId_A}}/recall`
- ✅ Expect `409` — cannot recall while another patient is IN_PROGRESS

**Step 6 — Serve Patient B**
- `PATCH /queue/{{queueEntryId_B}}/serve`
- ✅ `SERVED`

**Step 7 — Now Recall Patient A (should succeed)**
- `PATCH /queue/{{queueEntryId_A}}/recall`
- ✅ Patient A is now `IN_PROGRESS`

---

## WORKFLOW D — Soft Delete & Restore Patient

**Step 1** — Create patient → `{{patientId}}`

**Step 2** — Delete patient
- `DELETE /patients/{{patientId}}`
- ✅ Status: `200`

**Step 3** — Try to get deleted patient (should still work)
- `GET /patients/{{patientId}}`
- ✅ `data.deletedAt` is not null

**Step 4** — Search patients (should NOT appear by default)
- `GET /patients?search=Ahmed`
- ✅ Deleted patient NOT in results

**Step 5** — Search with includeDeleted=true
- `GET /patients?includeDeleted=true`
- ✅ Deleted patient appears

**Step 6** — Try to delete again (should fail)
- `DELETE /patients/{{patientId}}`
- ✅ Expect `400`: "Patient is already deleted"

**Step 7** — Restore patient
- `PATCH /patients/{{patientId}}/restore`
- ✅ `data.deletedAt` is `null`

**Step 8** — Search patients again
- `GET /patients?search=Ahmed`
- ✅ Patient reappears

---

## WORKFLOW E — Token Refresh

**Step 1** — Login, save `refreshToken`

**Step 2** — Call a protected endpoint → works fine

**Step 3** — Simulate expired access token by setting `{{accessToken}}` to `"invalid_token"`

**Step 4** — Call `GET /auth/me`
- ✅ Expect `401`

**Step 5** — Refresh tokens
- `POST /auth/refresh` with `{ refreshToken: "{{refreshToken}}" }`
- ✅ Get new `accessToken` and `refreshToken`

**Step 6** — Update `{{accessToken}}` with new value

**Step 7** — Call `GET /auth/me` again
- ✅ Now works with `200`

---

---

# ERROR SCENARIO TESTS

Use these to verify the backend properly rejects bad input.

## Appointment Conflict Tests

| Test | Action | Expected |
|---|---|---|
| Double-book slot | Create two appointments for same date/time | `409` |
| Past date | Create appointment with yesterday's date | `400` |
| Update non-SCHEDULED | Try to PATCH a COMPLETED appointment | `400` |
| Complete CANCELLED | Try to complete a CANCELLED appointment | `400` |
| Cancel COMPLETED | Try to cancel a COMPLETED appointment | `400` |

## Queue Conflict Tests

| Test | Action | Expected |
|---|---|---|
| Double check-in | Check same patient into queue twice today | `409` |
| Call-next with IN_PROGRESS | Call next when one is already IN_PROGRESS | `409` |
| Serve WAITING entry | Call /serve on a WAITING entry | `400` |
| Start WAITING entry | Call /start on a WAITING entry | `400` |
| Reserve slot 4 | Try `POST /queue/reserve` with `queueNumber: 4` | `400` |

## Patient Conflict Tests

| Test | Action | Expected |
|---|---|---|
| Duplicate MRN | Create two patients with same MRN | `409` |
| Duplicate phone | Create two patients with same phone | `409` |
| Restore active patient | Call restore on a patient who isn't deleted | `400` |
| Delete already-deleted | Call delete twice | `400` |

## Role Tests

| Test | Action | Expected |
|---|---|---|
| RECEPTIONIST creates visit | Login as receptionist, `POST /visits` | `403` |
| RECEPTIONIST updates visit | Login as receptionist, `PATCH /visits/:id` | `403` |
| RECEPTIONIST deletes visit | Login as receptionist, `DELETE /visits/:id` | `403` |

## Visit Conflict Tests

| Test | Action | Expected |
|---|---|---|
| Two visits same patient same day | Create two visits for same patient on same date | `409` |
| Link used appointment | Link a visit to an appointment that already has a visit | `409` |
| One visit per day | Second check-in attempt same day (already has a visit) | `409` |

---

---

# CLINIC SETTINGS TESTING

## Test: Update appointment slot duration

**Before:**
- `GET /clinic-settings` — note current `appointmentDuration`

**Update:**
- `PATCH /clinic-settings` with `{ appointmentDuration: 20 }`
- ✅ Status: `200`, `data.appointmentDuration` = `20`

**Restore:**
- `PATCH /clinic-settings` with `{ appointmentDuration: 30 }`

## Test: Update all working hours

```json
PATCH /clinic-settings
{
  "workingHours": {
    "monday":    { "open": "08:00", "close": "17:00", "isOpen": true },
    "tuesday":   { "open": "08:00", "close": "17:00", "isOpen": true },
    "wednesday": { "open": "08:00", "close": "17:00", "isOpen": true },
    "thursday":  { "open": "08:00", "close": "17:00", "isOpen": true },
    "friday":    { "open": "08:00", "close": "17:00", "isOpen": true },
    "saturday":  { "open": "09:00", "close": "13:00", "isOpen": true },
    "sunday":    { "open": "09:00", "close": "13:00", "isOpen": false }
  }
}
```
- ✅ Status: `200`
- ⚠️ Fail test: omit one day (e.g., remove `sunday`) → expect `400`

## Test: Update empty body
- `PATCH /clinic-settings` with `{}`
- ✅ Expect `400`: "At least one field must be provided for update"

---

---

# ⚠️ IMPORTANT NOTES & DISCREPANCIES

## 1. `CONFIRMED` and `NO_SHOW` Status — No Dedicated Endpoint
The `CONFIRMED` and `NO_SHOW` appointment statuses exist in the data model and can appear in filter queries, but **no endpoint exists to transition to these statuses**. The documentation explicitly states: *"Dedicated transition endpoints for these statuses are not currently implemented."*

- Do NOT try to set these via `PATCH /appointments/:id` (status is immutable via that endpoint).
- These values may be seeded directly in the database for testing filters.

## 2. `appointmentTime` in Response Format
The `appointmentTime` field is returned as a full ISO datetime anchored to `1970-01-01`:
```
"appointmentTime": "1970-01-01T09:30:00.000Z"
```
This is expected. Only the time portion matters. Send requests with `"HH:MM"` format (e.g., `"09:30"`).

## 3. `POST /visits` requires a SCHEDULED appointment
If you pass `appointmentId` to `POST /visits`, that appointment must be in `SCHEDULED` status. A `COMPLETED` appointment will return `404`. This is important in Workflow A — complete the appointment AFTER creating the visit.

## 4. Queue `startedAt` is separate from `calledAt`
- `calledAt` = set when `/call-next` or `/recall` is used (patient summoned)
- `startedAt` = set when `/queue/:id/start` is called (consultation actually begins)
- The `/serve` endpoint sets `servedAt`, NOT `startedAt`
- Statistics (`averageWaitTimeMinutes`) are only calculated for entries that have BOTH `checkedInAt` and `startedAt` set

## 5. `POST /queue/check-in` creates both a Visit and a QueueEntry
Calling `/queue/check-in` automatically creates a linked Visit. You should NOT separately call `POST /visits` for the same patient on the same day — it will return `409` ("Patient already has a visit record for this date").

## 6. Access Token Lifetime
Per the documentation: access tokens live **7 days**, refresh tokens live **30 days** by default. For testing, tokens are unlikely to expire mid-session. If you get `401`, use `/auth/refresh`.

---

---

# COMPLETE TESTING CHECKLIST

Use this as your Postman run sheet. Check off each endpoint as you test it.

---

## 🟢 Health
- [ ] `GET /health` — Server is healthy

---

## 🔐 Authentication
- [ ] `POST /auth/login` — Login successfully, get tokens
- [ ] `POST /auth/login` — Fail: wrong password → `401`
- [ ] `POST /auth/login` — Fail: invalid email format → `400`
- [ ] `POST /auth/refresh` — Refresh tokens successfully
- [ ] `POST /auth/refresh` — Fail: invalid refresh token → `401`
- [ ] `GET /auth/me` — Get current user profile
- [ ] `GET /auth/me` — Fail: no token → `401`
- [ ] `PATCH /auth/change-password` — Change password successfully
- [ ] `PATCH /auth/change-password` — Fail: wrong current password → `401`
- [ ] `PATCH /auth/change-password` — Fail: passwords don't match → `400`
- [ ] `POST /auth/logout` — Logout successfully

---

## 👤 Patients
- [ ] `POST /patients` — Create patient successfully → `201`
- [ ] `POST /patients` — Fail: duplicate MRN → `409`
- [ ] `POST /patients` — Fail: duplicate phone → `409`
- [ ] `POST /patients` — Fail: missing required fields → `400`
- [ ] `POST /patients` — Fail: future dateOfBirth → `400`
- [ ] `GET /patients` — List all patients
- [ ] `GET /patients?search=Ahmed` — Search by name
- [ ] `GET /patients?gender=MALE` — Filter by gender
- [ ] `GET /patients?page=1&limit=5` — Pagination
- [ ] `GET /patients?includeDeleted=true` — Include soft-deleted
- [ ] `GET /patients/:id` — Get single patient
- [ ] `GET /patients/:id` — Fail: invalid UUID → `400`
- [ ] `GET /patients/:id` — Fail: not found → `404`
- [ ] `PATCH /patients/:id` — Update fullName
- [ ] `PATCH /patients/:id` — Update phone (unique)
- [ ] `PATCH /patients/:id` — Fail: empty body → `400`
- [ ] `PATCH /patients/:id` — Fail: duplicate phone → `409`
- [ ] `DELETE /patients/:id` — Soft-delete patient → `200`
- [ ] `DELETE /patients/:id` — Fail: already deleted → `400`
- [ ] `PATCH /patients/:id/restore` — Restore deleted patient → `200`
- [ ] `PATCH /patients/:id/restore` — Fail: patient not deleted → `400`

---

## 📅 Appointments
- [ ] `POST /appointments` — Create appointment → `201`, status `SCHEDULED`
- [ ] `POST /appointments` — Fail: duplicate time slot → `409`
- [ ] `POST /appointments` — Fail: past date → `400`
- [ ] `POST /appointments` — Fail: deleted patient → `404`
- [ ] `GET /appointments` — List all appointments
- [ ] `GET /appointments?status=SCHEDULED` — Filter by status
- [ ] `GET /appointments?patientId={{patientId}}` — Filter by patient
- [ ] `GET /appointments?date=<date>` — Filter by exact date
- [ ] `GET /appointments?fromDate=<d>&toDate=<d>` — Filter by range
- [ ] `GET /appointments/:id` — Get single appointment
- [ ] `GET /appointments/:id` — Fail: not found → `404`
- [ ] `PATCH /appointments/:id` — Reschedule (date/time/notes)
- [ ] `PATCH /appointments/:id` — Fail: empty body → `400`
- [ ] `PATCH /appointments/:id` — Fail: conflict with existing slot → `409`
- [ ] `PATCH /appointments/:id/cancel` — Cancel SCHEDULED → `CANCELLED`
- [ ] `PATCH /appointments/:id/cancel` — Fail: already COMPLETED → `400`
- [ ] `PATCH /appointments/:id/complete` — Complete SCHEDULED → `COMPLETED`
- [ ] `PATCH /appointments/:id/complete` — Fail: already CANCELLED → `400`

---

## 🩺 Visits
- [ ] `POST /visits` — Create visit (DOCTOR) → `201`
- [ ] `POST /visits` — Create visit with appointmentId link → `201`
- [ ] `POST /visits` — Create visit with queueEntryId link → `201`
- [ ] `POST /visits` — Fail: RECEPTIONIST role → `403`
- [ ] `POST /visits` — Fail: same patient same day → `409`
- [ ] `POST /visits` — Fail: appointment already linked → `409`
- [ ] `GET /visits` — List visits
- [ ] `GET /visits?patientId={{patientId}}` — Filter by patient
- [ ] `GET /visits?date=<date>` — Filter by date
- [ ] `GET /visits?sortBy=visitDate&sortOrder=asc` — Sort
- [ ] `GET /visits/:id` — Get single visit (includes `startedAt`, `completedAt`, `followUpDate`)
- [ ] `GET /visits/:id` — Fail: not found → `404`
- [ ] `GET /patients/:patientId/visits` — All visits for one patient
- [ ] `PATCH /visits/:id` — Update diagnosis/treatment/prescription
- [ ] `PATCH /visits/:id` — Set followUpDate
- [ ] `PATCH /visits/:id` — Fail: RECEPTIONIST role → `403`
- [ ] `PATCH /visits/:id` — Fail: empty body → `400`
- [ ] `DELETE /visits/:id` — Delete visit (DOCTOR) → `200`
- [ ] `DELETE /visits/:id` — Fail: RECEPTIONIST role → `403`
- [ ] `DELETE /visits/:id` — Confirm linked appointment/queue entry is unlinked

---

## 🏥 Queue
- [ ] `POST /queue/check-in` — Check-in patient → `201`, status `WAITING`, `checkedInAt` set
- [ ] `POST /queue/check-in` — With appointmentId → `201`
- [ ] `POST /queue/check-in` — Fail: already in queue today → `409`
- [ ] `POST /queue/check-in` — Fail: deleted patient → `404`
- [ ] `POST /queue/reserve` — Reserve slot 1, 2, or 3
- [ ] `POST /queue/reserve` — Fail: slot already taken → `409`
- [ ] `POST /queue/reserve` — Fail: slot number > 3 → `400`
- [ ] `POST /queue/call-next` — Call next patient → `IN_PROGRESS`, `calledAt` set, `startedAt` null
- [ ] `POST /queue/call-next` — Fail: another IN_PROGRESS exists → `409`
- [ ] `POST /queue/call-next` — Fail: empty queue → `404`
- [ ] `PATCH /queue/:id/start` — Start consultation → `startedAt` set, status still `IN_PROGRESS`
- [ ] `PATCH /queue/:id/start` — Fail: entry is WAITING (not IN_PROGRESS) → `400`
- [ ] `PATCH /queue/:id/serve` — Mark served → `SERVED`, `servedAt` set
- [ ] `PATCH /queue/:id/serve` — Fail: entry is WAITING → `400`
- [ ] `PATCH /queue/:id/skip` — Skip back to WAITING → `calledAt` cleared
- [ ] `PATCH /queue/:id/skip` — Fail: entry is already WAITING → `400`
- [ ] `PATCH /queue/:id/recall` — Recall specific patient → `IN_PROGRESS`, `calledAt` set
- [ ] `PATCH /queue/:id/recall` — Fail: another patient IN_PROGRESS → `409`
- [ ] `PATCH /queue/:id/recall` — Fail: entry not WAITING → `400`
- [ ] `PATCH /queue/:id/cancel` — Cancel WAITING entry → `CANCELLED`
- [ ] `PATCH /queue/:id/cancel` — Cancel IN_PROGRESS entry → `CANCELLED`
- [ ] `PATCH /queue/:id/cancel` — Fail: already SERVED → `400`
- [ ] `GET /queue` — List today's queue
- [ ] `GET /queue?status=WAITING` — Filter by status
- [ ] `GET /queue?date=<date>` — Filter by date
- [ ] `GET /queue/status` — Real-time snapshot (currentlyServing, nextWaiting, counts)
- [ ] `GET /queue/statistics` — Statistics for today
- [ ] `GET /queue/statistics?date=<date>` — Statistics for specific date
- [ ] `GET /queue/:id` — Get single queue entry (all timestamps)
- [ ] `POST /queue/reset` — Reset queue (cancels all WAITING + IN_PROGRESS)

---

## 📊 Dashboard
- [ ] `GET /dashboard/overview` — High-level stats
- [ ] `GET /dashboard/overview?date=<date>` — Stats for specific date
- [ ] `GET /dashboard/today` — Today's complete snapshot
- [ ] `GET /dashboard/queue` — Live queue dashboard
- [ ] `GET /dashboard/queue?date=<date>` — Queue dashboard for specific date
- [ ] `GET /dashboard/appointments` — Appointments by date range
- [ ] `GET /dashboard/appointments?fromDate=<d>&toDate=<d>` — Custom range
- [ ] `GET /dashboard/patients` — Patient statistics
- [ ] `GET /dashboard/analytics` — Time-series analytics
- [ ] `GET /dashboard/analytics?fromDate=<d>&toDate=<d>` — Custom analytics range
- [ ] `GET /dashboard/analytics` — Fail: fromDate after toDate → `400`

---

## ⚙️ Clinic Settings
- [ ] `GET /clinic-settings` — Get settings (verify appointmentDuration, gracePeriod, delayThreshold)
- [ ] `PATCH /clinic-settings` — Update clinic name
- [ ] `PATCH /clinic-settings` — Update appointmentDuration
- [ ] `PATCH /clinic-settings` — Update gracePeriod
- [ ] `PATCH /clinic-settings` — Update delayThreshold
- [ ] `PATCH /clinic-settings` — Update maxPatientsPerDay
- [ ] `PATCH /clinic-settings` — Update all 7 days of workingHours
- [ ] `PATCH /clinic-settings` — Fail: provide workingHours with only 6 days → `400`
- [ ] `PATCH /clinic-settings` — Fail: empty body → `400`
- [ ] `PATCH /clinic-settings` — Fail: invalid email → `400`
- [ ] `PATCH /clinic-settings` — Fail: invalid HH:MM format → `400`

---

## 🔑 Auth Edge Cases
- [ ] Call protected endpoint with no Authorization header → `401`
- [ ] Call protected endpoint with expired token → `401`
- [ ] Call DOCTOR-only endpoint with RECEPTIONIST token → `403`
- [ ] Call `/auth/refresh` with an access token (not refresh token) → `401` "Invalid token type"

---

**Total Endpoints: 45**
**Total Test Cases: ~95**

---

*This guide was generated strictly from `Api-Doc.md`. No endpoints, fields, or behaviors were invented or assumed. Any feature not present in the documentation is not documented here.*
