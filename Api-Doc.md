# Clinic Management System API Documentation

---

## 1. Base URL

```
http://localhost:5000/api/v1
```

Configure this in your Next.js frontend as an environment variable:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

In production, replace with your deployed server URL:

```env
NEXT_PUBLIC_API_URL=https://api.yourclinic.com/api/v1
```

All requests must be prefixed with this base URL. Every endpoint in this documentation is relative to it.

---

## 2. Authentication

### How It Works

This API uses **JWT (JSON Web Token)** based authentication with a dual-token strategy:

- **Access Token** — Short-lived (default: 7 days). Must be sent with every protected request.
- **Refresh Token** — Long-lived (default: 30 days). Used only to obtain a new token pair.

### Token Location

Every protected request must include the access token in the HTTP `Authorization` header:

```
Authorization: Bearer <accessToken>
```

### Clinic Isolation

Every authenticated user belongs to exactly one clinic. The JWT payload contains:

```json
{
  "sub": "user-uuid",
  "clinicId": "clinic-uuid",
  "role": "DOCTOR",
  "type": "access"
}
```

The backend automatically scopes all data queries to the authenticated user's `clinicId`. Users cannot access another clinic's data under any circumstances.

### Roles

| Role           | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| `DOCTOR`       | Full read/write access to all clinical data                    |
| `RECEPTIONIST` | Full access to operational data, read-only on clinical records |

### Error Causes

| Status | Cause                                                         |
| ------ | ------------------------------------------------------------- |
| `401`  | Missing token, invalid token, expired token, wrong token type |
| `403`  | Valid token but insufficient role for the endpoint            |

---

## 3. API Response Format

All responses follow a consistent structure.

### Success Response

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

### Paginated Response

```json
{
  "success": true,
  "message": "Records retrieved successfully",
  "data": [],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Validation Error (400)

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "email", "message": "Invalid email address" }]
}
```

### Unauthorized (401)

```json
{
  "success": false,
  "message": "Access token has expired"
}
```

### Forbidden (403)

```json
{
  "success": false,
  "message": "Access denied. Required role: DOCTOR"
}
```

### Not Found (404)

```json
{
  "success": false,
  "message": "Patient not found"
}
```

### Conflict (409)

```json
{
  "success": false,
  "message": "A patient with this MRN already exists in this clinic"
}
```

### Server Error (500)

```json
{
  "success": false,
  "message": "An unexpected error occurred."
}
```

---

# MODULE DOCUMENTATION

---

## Health

### GET /health

**Purpose:** Verifies the service is running. Used by load balancers, Docker health checks, and uptime monitors.

**Authentication:** Not Required

**Roles:** None

**Headers:** None

**Request Body:** None

**Query Parameters:** None

**Success Response (200)**

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

**Error Responses:** None

**Example Request**

```http
GET /api/v1/health
```

---

## Authentication

### POST /auth/login

**Purpose:** Authenticates a user with email and password. Returns an access token and refresh token.

**Authentication:** Not Required

**Roles:** None

**Headers:**

```
Content-Type: application/json
```

**Request Body**

```json
{
  "email": "doctor@clinic.com",
  "password": "Password@123"
}
```

**Validation Rules**

| Field    | Rules                                                |
| -------- | ---------------------------------------------------- |
| email    | Required, valid email format, lowercased and trimmed |
| password | Required, non-empty string                           |

**Success Response (200)**

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

**Error Responses**

| Status | Message                                                              |
| ------ | -------------------------------------------------------------------- |
| `400`  | Validation failed                                                    |
| `401`  | Invalid email or password                                            |
| `403`  | Your account has been deactivated. Please contact your administrator |

**Example Request**

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "doctor@clinic.com",
  "password": "Password@123"
}
```

---

### POST /auth/refresh

**Purpose:** Issues a new access token and refresh token pair using a valid refresh token.

**Authentication:** Not Required

**Roles:** None

**Headers:**

```
Content-Type: application/json
```

**Request Body**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Validation Rules**

| Field        | Rules                      |
| ------------ | -------------------------- |
| refreshToken | Required, non-empty string |

**Success Response (200)**

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

**Error Responses**

| Status | Message                           |
| ------ | --------------------------------- |
| `400`  | Validation failed                 |
| `401`  | Invalid or expired refresh token  |
| `401`  | Invalid token type                |
| `403`  | Your account has been deactivated |

---

### POST /auth/logout

**Purpose:** Logs out the authenticated user. Tokens must be discarded client-side.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null
}
```

**Error Responses**

| Status | Message                         |
| ------ | ------------------------------- |
| `401`  | Missing or invalid access token |

---

### GET /auth/me

**Purpose:** Returns the full profile of the currently authenticated user.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Success Response (200)**

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

**Error Responses**

| Status | Message                           |
| ------ | --------------------------------- |
| `401`  | Missing or invalid access token   |
| `403`  | Your account has been deactivated |
| `404`  | User not found                    |

---

### PATCH /auth/change-password

**Purpose:** Changes the password for the currently authenticated user.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "currentPassword": "OldPassword@123",
  "newPassword": "NewPassword@456",
  "confirmPassword": "NewPassword@456"
}
```

**Validation Rules**

| Field           | Rules                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| currentPassword | Required, non-empty                                                                                      |
| newPassword     | Required, min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character, must differ from current |
| confirmPassword | Required, must match newPassword                                                                         |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": null
}
```

**Error Responses**

| Status | Message                                              |
| ------ | ---------------------------------------------------- |
| `400`  | Validation failed                                    |
| `400`  | New password must be different from current password |
| `400`  | Passwords do not match                               |
| `401`  | Current password is incorrect                        |
| `401`  | Missing or invalid access token                      |
| `403`  | Your account has been deactivated                    |

---

## Patients

### POST /patients

**Purpose:** Creates a new patient record for the clinic. MRN and phone must be unique within the clinic.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

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

**Validation Rules**

| Field       | Type   | Required | Rules                                                    |
| ----------- | ------ | -------- | -------------------------------------------------------- |
| mrn         | string | Yes      | Max 50 chars, letters/numbers/hyphens/underscores only   |
| fullName    | string | Yes      | Min 2, max 100 characters                                |
| phone       | string | Yes      | Min 7, max 20 characters, valid phone format             |
| dateOfBirth | string | Yes      | Format YYYY-MM-DD, must be in the past, after 1900-01-01 |
| gender      | enum   | Yes      | MALE, FEMALE, OTHER                                      |
| address     | string | No       | Max 255 characters                                       |
| notes       | string | No       | Max 1000 characters                                      |

**Success Response (201)**

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

**Error Responses**

| Status | Message                                                          |
| ------ | ---------------------------------------------------------------- |
| `400`  | Validation failed                                                |
| `401`  | Unauthorized                                                     |
| `403`  | Insufficient role                                                |
| `409`  | A patient with MRN "MRN001" already exists in this clinic        |
| `409`  | A patient with phone "01012345678" already exists in this clinic |

---

### GET /patients

**Purpose:** Returns a paginated list of patients for the clinic. Supports search, filtering, and pagination.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter      | Type    | Default | Description                                     |
| -------------- | ------- | ------- | ----------------------------------------------- |
| search         | string  | —       | Case-insensitive search on fullName, phone, MRN |
| gender         | enum    | —       | MALE, FEMALE, OTHER                             |
| includeDeleted | boolean | false   | Set to `true` to include soft-deleted patients  |
| page           | integer | 1       | Page number, min 1                              |
| limit          | integer | 10      | Results per page, min 1, max 100                |

**Sorting:** `createdAt` descending (newest first)

**Success Response (200)**

```json
{
  "success": true,
  "message": "Patients retrieved successfully",
  "data": [
    {
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
  ],
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

**Error Responses**

| Status | Message                  |
| ------ | ------------------------ |
| `400`  | Invalid query parameters |
| `401`  | Unauthorized             |
| `403`  | Insufficient role        |

---

### GET /patients/:id

**Purpose:** Returns the full profile of a single patient including visit and appointment history.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description        |
| --------- | ---- | -------- | ------------------ |
| id        | UUID | Yes      | The patient's UUID |

**Request Body:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Patient retrieved successfully",
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
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "visits": [
      {
        "id": "uuid",
        "visitDate": "2024-01-15T00:00:00.000Z",
        "chiefComplaint": "Headache",
        "diagnosis": "Tension headache",
        "createdAt": "2024-01-15T10:00:00.000Z"
      }
    ],
    "appointments": [
      {
        "id": "uuid",
        "appointmentDate": "2024-01-15T00:00:00.000Z",
        "appointmentTime": "1970-01-01T09:00:00.000Z",
        "status": "COMPLETED",
        "notes": null
      }
    ]
  }
}
```

**Error Responses**

| Status | Message             |
| ------ | ------------------- |
| `400`  | Invalid UUID format |
| `401`  | Unauthorized        |
| `403`  | Insufficient role   |
| `404`  | Patient not found   |

---

### PATCH /patients/:id

**Purpose:** Partially updates a patient record. MRN cannot be changed. At least one field required.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Path Parameters**

| Parameter | Type | Required | Description        |
| --------- | ---- | -------- | ------------------ |
| id        | UUID | Yes      | The patient's UUID |

**Request Body**

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

**Mutable Fields**

| Field       | Mutable | Notes                            |
| ----------- | ------- | -------------------------------- |
| mrn         | No      | Cannot be changed after creation |
| fullName    | Yes     | Min 2, max 100 chars             |
| phone       | Yes     | Must be unique within clinic     |
| dateOfBirth | Yes     | Format YYYY-MM-DD                |
| gender      | Yes     | MALE, FEMALE, OTHER              |
| address     | Yes     | Max 255 chars, nullable          |
| notes       | Yes     | Max 1000 chars, nullable         |

**Success Response (200)**

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

**Error Responses**

| Status | Message                                        |
| ------ | ---------------------------------------------- |
| `400`  | Validation failed                              |
| `400`  | At least one field must be provided for update |
| `401`  | Unauthorized                                   |
| `403`  | Insufficient role                              |
| `404`  | Patient not found                              |
| `409`  | Phone number already exists in this clinic     |

---

### DELETE /patients/:id

**Purpose:** Soft-deletes a patient by setting `deletedAt`. Record is preserved for audit purposes.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description        |
| --------- | ---- | -------- | ------------------ |
| id        | UUID | Yes      | The patient's UUID |

**Request Body:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Patient deleted successfully",
  "data": null
}
```

**Error Responses**

| Status | Message                    |
| ------ | -------------------------- |
| `400`  | Patient is already deleted |
| `400`  | Invalid UUID format        |
| `401`  | Unauthorized               |
| `403`  | Insufficient role          |
| `404`  | Patient not found          |

---

### PATCH /patients/:id/restore

**Purpose:** Restores a soft-deleted patient by clearing `deletedAt`.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description        |
| --------- | ---- | -------- | ------------------ |
| id        | UUID | Yes      | The patient's UUID |

**Request Body:** None

**Success Response (200)**

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

**Error Responses**

| Status | Message                |
| ------ | ---------------------- |
| `400`  | Patient is not deleted |
| `400`  | Invalid UUID format    |
| `401`  | Unauthorized           |
| `403`  | Insufficient role      |
| `404`  | Patient not found      |

---

## Appointments

### Appointment Status Values

| Status      | Description                                                             |
| ----------- | ----------------------------------------------------------------------- |
| `SCHEDULED` | Default status when an appointment is created. Awaiting confirmation.   |
| `CONFIRMED` | Appointment has been confirmed (e.g. by the clinic or patient).         |
| `COMPLETED` | Appointment was attended and marked complete via `PATCH /:id/complete`. |
| `CANCELLED` | Appointment was cancelled via `PATCH /:id/cancel`.                      |
| `NO_SHOW`   | Patient did not attend the appointment.                                 |

**Allowed Status Transitions**

| From        | To          | Endpoint                            |
| ----------- | ----------- | ----------------------------------- |
| `SCHEDULED` | `CONFIRMED` | `PATCH /appointments/:id/confirm`   |
| `SCHEDULED` | `CANCELLED` | `PATCH /appointments/:id/cancel`    |
| `SCHEDULED` | `NO_SHOW`   | `PATCH /appointments/:id/no-show`   |
| `CONFIRMED` | `COMPLETED` | `PATCH /appointments/:id/complete`  |
| `CONFIRMED` | `CANCELLED` | `PATCH /appointments/:id/cancel`    |
| `CONFIRMED` | `NO_SHOW`   | `PATCH /appointments/:id/no-show`   |

**Slot Conflict Rule:** Only `SCHEDULED` and `CONFIRMED` appointments block the same date/time slot from being booked again.

---

### POST /appointments

**Purpose:** Books a new appointment for a patient. Prevents double-booking the same time slot.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "patientId": "uuid",
  "appointmentDate": "2024-02-01",
  "appointmentTime": "09:30",
  "notes": "Follow-up visit"
}
```

**Validation Rules**

| Field           | Type   | Required | Rules                                        |
| --------------- | ------ | -------- | -------------------------------------------- |
| patientId       | UUID   | Yes      | Must reference an active non-deleted patient |
| appointmentDate | string | Yes      | Format YYYY-MM-DD, cannot be in the past     |
| appointmentTime | string | Yes      | Format HH:MM (24-hour)                       |
| notes           | string | No       | Max 1000 characters                          |

**Success Response (201)**

```json
{
  "success": true,
  "message": "Appointment created successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "patientId": "uuid",
    "visitId": null,
    "appointmentDate": "2024-02-01T00:00:00.000Z",
    "appointmentTime": "1970-01-01T09:30:00.000Z",
    "status": "SCHEDULED",
    "notes": "Follow-up visit",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z",
    "patient": {
      "id": "uuid",
      "fullName": "Ahmed Mohamed",
      "phone": "01012345678",
      "mrn": "MRN001"
    },
    "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" }
  }
}
```

**Error Responses**

| Status | Message                                              |
| ------ | ---------------------------------------------------- |
| `400`  | Appointment date cannot be in the past               |
| `400`  | Validation failed                                    |
| `401`  | Unauthorized                                         |
| `403`  | Insufficient role                                    |
| `404`  | Patient not found or has been deleted                |
| `409`  | An appointment already exists at 09:30 on 2024-02-01 |

---

### GET /appointments

**Purpose:** Returns a paginated list of appointments. Supports multiple filters.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter | Type    | Default | Description                                         |
| --------- | ------- | ------- | --------------------------------------------------- |
| search    | string  | —       | Searches patient fullName, phone, MRN               |
| status    | enum    | —       | SCHEDULED, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW |
| patientId | UUID    | —       | Filter by specific patient                          |
| date      | string  | —       | Exact date filter YYYY-MM-DD                        |
| fromDate  | string  | —       | Start of date range YYYY-MM-DD                      |
| toDate    | string  | —       | End of date range YYYY-MM-DD                        |
| page      | integer | 1       | Page number, min 1                                  |
| limit     | integer | 10      | Results per page, min 1, max 100                    |

**Sorting:** `appointmentDate` ascending, then `appointmentTime` ascending

**Success Response (200)**

```json
{
  "success": true,
  "message": "Appointments retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "clinicId": "uuid",
      "patientId": "uuid",
      "visitId": null,
      "appointmentDate": "2024-02-01T00:00:00.000Z",
      "appointmentTime": "1970-01-01T09:30:00.000Z",
      "status": "SCHEDULED",
      "notes": "Follow-up visit",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z",
      "patient": {
        "id": "uuid",
        "fullName": "Ahmed Mohamed",
        "phone": "01012345678",
        "mrn": "MRN001"
      },
      "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
      "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" }
    }
  ],
  "meta": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

**Error Responses**

| Status | Message                  |
| ------ | ------------------------ |
| `400`  | Invalid query parameters |
| `401`  | Unauthorized             |
| `403`  | Insufficient role        |

---

### GET /appointments/:id

**Purpose:** Returns full details of a single appointment including linked visit.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The appointment's UUID |

**Request Body:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Appointment retrieved successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "patientId": "uuid",
    "visitId": "uuid",
    "appointmentDate": "2024-02-01T00:00:00.000Z",
    "appointmentTime": "1970-01-01T09:30:00.000Z",
    "status": "COMPLETED",
    "notes": "Follow-up visit",
    "patient": {
      "id": "uuid",
      "fullName": "Ahmed Mohamed",
      "phone": "01012345678",
      "mrn": "MRN001"
    },
    "visit": {
      "id": "uuid",
      "visitDate": "2024-02-01T00:00:00.000Z",
      "chiefComplaint": "Headache",
      "diagnosis": "Tension headache",
      "treatment": "Rest and paracetamol",
      "prescription": "Paracetamol 500mg",
      "notes": null,
      "createdAt": "2024-02-01T09:30:00.000Z"
    },
    "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-02-01T10:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message               |
| ------ | --------------------- |
| `400`  | Invalid UUID format   |
| `401`  | Unauthorized          |
| `403`  | Insufficient role     |
| `404`  | Appointment not found |

---

### PATCH /appointments/:id

**Purpose:** Updates a `SCHEDULED` or `CONFIRMED` appointment's date, time, or notes. Validates for slot conflicts.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The appointment's UUID |

**Request Body**

```json
{
  "appointmentDate": "2024-02-05",
  "appointmentTime": "10:00",
  "notes": "Rescheduled by patient request"
}
```

**Mutable Fields**

| Field           | Mutable | Notes                                    |
| --------------- | ------- | ---------------------------------------- |
| patientId       | No      | Cannot be changed                        |
| status          | No      | Use cancel/complete endpoints            |
| appointmentDate | Yes     | Format YYYY-MM-DD, cannot be in the past |
| appointmentTime | Yes     | Format HH:MM                             |
| notes           | Yes     | Max 1000 chars, nullable                 |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Appointment updated successfully",
  "data": {
    "id": "uuid",
    "appointmentDate": "2024-02-05T00:00:00.000Z",
    "appointmentTime": "1970-01-01T10:00:00.000Z",
    "status": "SCHEDULED",
    "notes": "Rescheduled by patient request",
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message                                        |
| ------ | ---------------------------------------------- |
| `400`  | Validation failed                              |
| `400`  | At least one field must be provided for update |
| `400`  | Only scheduled or confirmed appointments can be updated |
| `401`  | Unauthorized                                   |
| `403`  | Insufficient role                              |
| `404`  | Appointment not found                          |
| `409`  | New time slot is already booked                |

---

### PATCH /appointments/:id/cancel

**Purpose:** Cancels a SCHEDULED appointment. Frees the time slot for new bookings.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The appointment's UUID |

**Request Body:** None

**Status Transition:** `SCHEDULED → CANCELLED` or `CONFIRMED → CANCELLED`

**Success Response (200)**

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

**Error Responses**

| Status | Message                                                       |
| ------ | ------------------------------------------------------------- |
| `400`  | Cannot transition appointment from "COMPLETED" to "CANCELLED" |
| `401`  | Unauthorized                                                  |
| `403`  | Insufficient role                                             |
| `404`  | Appointment not found                                         |

---

### PATCH /appointments/:id/confirm

**Purpose:** Confirms a `SCHEDULED` appointment.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The appointment's UUID |

**Request Body:** None

**Status Transition:** `SCHEDULED → CONFIRMED`

**Success Response (200)**

```json
{
  "success": true,
  "message": "Appointment confirmed successfully",
  "data": {
    "id": "uuid",
    "status": "CONFIRMED",
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message                                                        |
| ------ | -------------------------------------------------------------- |
| `400`  | Cannot transition appointment from "CONFIRMED" to "CONFIRMED" |
| `401`  | Unauthorized                                                   |
| `403`  | Insufficient role                                              |
| `404`  | Appointment not found                                          |

---

### PATCH /appointments/:id/complete

**Purpose:** Marks a `CONFIRMED` appointment as `COMPLETED`.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The appointment's UUID |

**Request Body:** None

**Status Transition:** `CONFIRMED → COMPLETED`

**Success Response (200)**

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

**Error Responses**

| Status | Message                                                       |
| ------ | ------------------------------------------------------------- |
| `400`  | Cannot transition appointment from "CANCELLED" to "COMPLETED" |
| `401`  | Unauthorized                                                  |
| `403`  | Insufficient role                                             |
| `404`  | Appointment not found                                         |

---

### PATCH /appointments/:id/no-show

**Purpose:** Marks a `SCHEDULED` or `CONFIRMED` appointment as `NO_SHOW`.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The appointment's UUID |

**Request Body:** None

**Status Transitions:** `SCHEDULED → NO_SHOW` or `CONFIRMED → NO_SHOW`

**Success Response (200)**

```json
{
  "success": true,
  "message": "Appointment marked as no-show successfully",
  "data": {
    "id": "uuid",
    "status": "NO_SHOW",
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message                                                     |
| ------ | ----------------------------------------------------------- |
| `400`  | Cannot transition appointment from "COMPLETED" to "NO_SHOW" |
| `401`  | Unauthorized                                                |
| `403`  | Insufficient role                                           |
| `404`  | Appointment not found                                       |

---

## Visits

### POST /visits

**Purpose:** Creates a new visit record for a patient. Optionally links to an appointment or queue entry. Only one visit per patient per day is allowed.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST only

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "patientId": "uuid",
  "appointmentId": "uuid",
  "queueEntryId": "uuid",
  "visitDate": "2024-01-15",
  "chiefComplaint": "Headache and fever",
  "diagnosis": "Tension headache",
  "treatment": "Rest and paracetamol",
  "prescription": "Paracetamol 500mg",
  "notes": "Patient looked fatigued"
}
```

**Validation Rules**

| Field          | Type   | Required | Rules                                            |
| -------------- | ------ | -------- | ------------------------------------------------ |
| patientId      | UUID   | Yes      | Must reference an active non-deleted patient     |
| appointmentId  | UUID   | No       | Must not be cancelled and must not already have a visit linked |
| queueEntryId   | UUID   | No       | Must be an unlinked queue entry                  |
| visitDate      | string | No       | Format YYYY-MM-DD, defaults to today             |
| chiefComplaint | string | No       | Max 500 characters                               |
| diagnosis      | string | No       | Max 1000 characters                              |
| treatment      | string | No       | Max 1000 characters                              |
| prescription   | string | No       | Max 1000 characters                              |
| notes          | string | No       | Max 1000 characters                              |

**Success Response (201)**

```json
{
  "success": true,
  "message": "Visit created successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "patientId": "uuid",
    "visitDate": "2024-01-15T00:00:00.000Z",
    "chiefComplaint": "Headache and fever",
    "diagnosis": "Tension headache",
    "treatment": "Rest and paracetamol",
    "prescription": "Paracetamol 500mg",
    "notes": "Patient looked fatigued",
    "startedAt": null,
    "completedAt": null,
    "followUpDate": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z",
    "patient": {
      "id": "uuid",
      "fullName": "Ahmed Mohamed",
      "phone": "01012345678",
      "mrn": "MRN001"
    },
    "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "appointment": {
      "id": "uuid",
      "appointmentDate": "2024-01-15T00:00:00.000Z",
      "appointmentTime": "1970-01-01T09:30:00.000Z",
      "status": "SCHEDULED",
      "notes": null
    },
    "queueEntry": {
      "id": "uuid",
      "queueNumber": 5,
      "status": "IN_PROGRESS",
      "calledAt": "2024-01-15T10:00:00.000Z",
      "servedAt": null
    }
  }
}
```

**Error Responses**

| Status | Message                                                  |
| ------ | -------------------------------------------------------- |
| `400`  | Validation failed                                        |
| `401`  | Unauthorized                                             |
| `403`  | RECEPTIONIST cannot create visits                        |
| `404`  | Patient not found or has been deleted                    |
| `404`  | Appointment not found or does not belong to this patient |
| `404`  | Queue entry not found                                    |
| `409`  | Patient already has a visit record for this date         |
| `409`  | Appointment already has a visit linked to it             |
| `409`  | Queue entry already has a visit linked to it             |

---

### GET /visits

**Purpose:** Returns a paginated list of visits. Supports search, filtering, and sorting.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter   | Type    | Default   | Description                            |
| ----------- | ------- | --------- | -------------------------------------- |
| search      | string  | —         | Searches patient fullName, phone, MRN  |
| patientId   | UUID    | —         | Filter by specific patient             |
| createdById | UUID    | —         | Filter by doctor who created the visit |
| date        | string  | —         | Exact date filter YYYY-MM-DD           |
| fromDate    | string  | —         | Start of date range YYYY-MM-DD         |
| toDate      | string  | —         | End of date range YYYY-MM-DD           |
| sortBy      | enum    | visitDate | visitDate or createdAt                 |
| sortOrder   | enum    | desc      | asc or desc                            |
| page        | integer | 1         | Page number, min 1                     |
| limit       | integer | 10        | Results per page, min 1, max 100       |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Visits retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "clinicId": "uuid",
      "patientId": "uuid",
      "visitDate": "2024-01-15T00:00:00.000Z",
      "chiefComplaint": "Headache",
      "diagnosis": "Tension headache",
      "treatment": "Rest",
      "prescription": "Paracetamol",
      "notes": null,
      "startedAt": null,
      "completedAt": "2024-01-15T10:30:00.000Z",
      "followUpDate": null,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z",
      "patient": {
        "id": "uuid",
        "fullName": "Ahmed Mohamed",
        "phone": "01012345678",
        "mrn": "MRN001"
      },
      "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
      "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" }
    }
  ],
  "meta": {
    "total": 30,
    "page": 1,
    "limit": 10,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

**Error Responses**

| Status | Message                  |
| ------ | ------------------------ |
| `400`  | Invalid query parameters |
| `401`  | Unauthorized             |
| `403`  | Insufficient role        |

---

### GET /visits/:id

**Purpose:** Returns full details of a single visit including linked appointment and queue entry.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description      |
| --------- | ---- | -------- | ---------------- |
| id        | UUID | Yes      | The visit's UUID |

**Request Body:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Visit retrieved successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "patientId": "uuid",
    "visitDate": "2024-01-15T00:00:00.000Z",
    "chiefComplaint": "Headache",
    "diagnosis": "Tension headache",
    "treatment": "Rest and paracetamol",
    "prescription": "Paracetamol 500mg",
    "notes": null,
    "startedAt": "2024-01-15T10:02:00.000Z",
    "completedAt": "2024-01-15T10:20:00.000Z",
    "followUpDate": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z",
    "patient": {
      "id": "uuid",
      "fullName": "Ahmed Mohamed",
      "phone": "01012345678",
      "mrn": "MRN001"
    },
    "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "appointment": {
      "id": "uuid",
      "appointmentDate": "2024-01-15T00:00:00.000Z",
      "appointmentTime": "1970-01-01T09:30:00.000Z",
      "status": "COMPLETED",
      "notes": null
    },
    "queueEntry": {
      "id": "uuid",
      "queueNumber": 5,
      "status": "SERVED",
      "calledAt": "2024-01-15T10:00:00.000Z",
      "servedAt": "2024-01-15T10:20:00.000Z"
    }
  }
}
```

**Error Responses**

| Status | Message             |
| ------ | ------------------- |
| `400`  | Invalid UUID format |
| `401`  | Unauthorized        |
| `403`  | Insufficient role   |
| `404`  | Visit not found     |

---

### GET /patients/:patientId/visits

**Purpose:** Returns all visits for a specific patient with pagination and filtering.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description        |
| --------- | ---- | -------- | ------------------ |
| patientId | UUID | Yes      | The patient's UUID |

**Query Parameters:** Same as `GET /visits`

**Success Response (200)**

```json
{
  "success": true,
  "message": "Patient visits retrieved successfully",
  "data": [],
  "meta": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

**Error Responses**

| Status | Message             |
| ------ | ------------------- |
| `400`  | Invalid UUID format |
| `401`  | Unauthorized        |
| `403`  | Insufficient role   |
| `404`  | Patient not found   |

---

### PATCH /visits/:id

**Purpose:** Updates a visit's clinical fields. Only DOCTOR can update. At least one field required.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST only

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Path Parameters**

| Parameter | Type | Required | Description      |
| --------- | ---- | -------- | ---------------- |
| id        | UUID | Yes      | The visit's UUID |

**Request Body**

```json
{
  "chiefComplaint": "Updated complaint",
  "diagnosis": "Updated diagnosis",
  "treatment": "Updated treatment",
  "prescription": "Updated prescription",
  "notes": "Updated notes",
  "followUpDate": "2024-02-15"
}
```

**Mutable Fields**

| Field          | Mutable | Notes                       |
| -------------- | ------- | --------------------------- |
| patientId      | No      | Cannot be changed           |
| visitDate      | No      | Cannot be changed           |
| chiefComplaint | Yes     | Max 500 chars, nullable     |
| diagnosis      | Yes     | Max 1000 chars, nullable    |
| treatment      | Yes     | Max 1000 chars, nullable    |
| prescription   | Yes     | Max 1000 chars, nullable    |
| notes          | Yes     | Max 1000 chars, nullable    |
| followUpDate   | Yes     | Format YYYY-MM-DD, nullable |

**Visit Timestamp Fields**

| Field          | Nullable | Description                                                                 |
| -------------- | -------- | --------------------------------------------------------------------------- |
| `startedAt`    | Yes      | Timestamp when the visit actually started (consultation began).             |
| `completedAt`  | Yes      | Timestamp when the visit was completed.                                     |
| `followUpDate` | Yes      | Date scheduled for a follow-up visit. Format: `YYYY-MM-DD`. `null` if none. |

**Success Response (200)**

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

**Error Responses**

| Status | Message                                        |
| ------ | ---------------------------------------------- |
| `400`  | At least one field must be provided for update |
| `400`  | Validation failed                              |
| `401`  | Unauthorized                                   |
| `403`  | RECEPTIONIST cannot update visits              |
| `404`  | Visit not found                                |

---

### DELETE /visits/:id

**Purpose:** Permanently deletes a visit. Unlinks related appointments and queue entries via transaction.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST only

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description      |
| --------- | ---- | -------- | ---------------- |
| id        | UUID | Yes      | The visit's UUID |

**Request Body:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Visit deleted successfully",
  "data": null
}
```

**Error Responses**

| Status | Message                           |
| ------ | --------------------------------- |
| `400`  | Invalid UUID format               |
| `401`  | Unauthorized                      |
| `403`  | RECEPTIONIST cannot delete visits |
| `404`  | Visit not found                   |

---

## Queue

### Queue State Machine

```
WAITING ──────────────► IN_PROGRESS ──────────────► SERVED
   ▲                          │
   │        (Skip)            │
   └──────────────────────────┘
   │
   └────────────────────────────────────────────────► CANCELLED

IN_PROGRESS ────────────────────────────────────────► CANCELLED
```

| Transition                | Endpoint                  | Description                               |
| ------------------------- | ------------------------- | ----------------------------------------- |
| `WAITING → IN_PROGRESS`   | `POST /queue/call-next`   | Calls next patient in line                |
| `IN_PROGRESS → SERVED`    | `PATCH /queue/:id/serve`  | Marks patient as served                   |
| `IN_PROGRESS → WAITING`   | `PATCH /queue/:id/skip`   | Sends patient back to waiting             |
| `WAITING → IN_PROGRESS`   | `PATCH /queue/:id/recall` | Directly calls a specific waiting patient |
| `IN_PROGRESS (startedAt)` | `PATCH /queue/:id/start`  | Starts the consultation; sets `startedAt` |
| `WAITING → CANCELLED`     | `PATCH /queue/:id/cancel` | Cancels a waiting entry                   |
| `IN_PROGRESS → CANCELLED` | `PATCH /queue/:id/cancel` | Cancels the currently serving entry       |

---

### POST /queue/check-in

**Purpose:** Checks a patient into today's queue. Creates a Visit and a QueueEntry atomically. Optionally links to an appointment.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "patientId": "uuid",
  "appointmentId": "uuid",
  "chiefComplaint": "Headache and fever",
  "notes": "Patient looks pale"
}
```

**Validation Rules**

| Field          | Type   | Required | Rules                                        |
| -------------- | ------ | -------- | -------------------------------------------- |
| patientId      | UUID   | Yes      | Must reference an active non-deleted patient |
| appointmentId  | UUID   | No       | Must be SCHEDULED and belong to this patient |
| chiefComplaint | string | No       | Max 500 characters                           |
| notes          | string | No       | Max 1000 characters                          |

**Success Response (201)**

```json
{
  "success": true,
  "message": "Patient checked in successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "visitId": "uuid",
    "queueDate": "2024-01-15T00:00:00.000Z",
    "queueNumber": 5,
    "isReserved": false,
    "reservedFor": null,
    "status": "WAITING",
    "checkedInAt": "2024-01-15T09:00:00.000Z",
    "calledAt": null,
    "startedAt": null,
    "servedAt": null,
    "createdAt": "2024-01-15T09:00:00.000Z",
    "updatedAt": "2024-01-15T09:00:00.000Z",
    "visit": {
      "id": "uuid",
      "visitDate": "2024-01-15T00:00:00.000Z",
      "chiefComplaint": "Headache and fever",
      "patient": {
        "id": "uuid",
        "fullName": "Ahmed Mohamed",
        "phone": "01012345678",
        "mrn": "MRN001"
      }
    },
    "createdBy": { "id": "uuid", "fullName": "Receptionist Sara" },
    "updatedBy": { "id": "uuid", "fullName": "Receptionist Sara" }
  }
}
```

**QueueEntry Timestamp Fields**

| Field         | Nullable | Description                                                                                                                                                         |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkedInAt` | Yes      | Timestamp when the patient checked in to the queue. Set at check-in time.                                                                                           |
| `calledAt`    | Yes      | Timestamp when the patient was called (status moved to `IN_PROGRESS`).                                                                                              |
| `startedAt`   | Yes      | Timestamp when the doctor actually started the consultation. Distinct from `calledAt`, which records when the patient was summoned, not when the appointment began. |
| `servedAt`    | Yes      | Timestamp when the queue entry was marked `SERVED`.                                                                                                                 |

**Error Responses**

| Status | Message                                                                     |
| ------ | --------------------------------------------------------------------------- |
| `400`  | Validation failed                                                           |
| `401`  | Unauthorized                                                                |
| `403`  | Insufficient role                                                           |
| `404`  | Patient not found or has been deleted                                       |
| `404`  | Appointment not found, does not belong to this patient, is not scheduled or confirmed, or is not for today |
| `409`  | Patient already has an active queue entry for today                         |
| `409`  | Appointment already has a visit linked to it                                |

---

### POST /queue/reserve

**Purpose:** Manually reserves one of the first three queue numbers (1, 2, or 3) before automatic numbering begins.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "queueNumber": 1,
  "reservedFor": "VIP Patient Name",
  "notes": "Director referral"
}
```

**Validation Rules**

| Field       | Type    | Required | Rules                     |
| ----------- | ------- | -------- | ------------------------- |
| queueNumber | integer | Yes      | Must be 1, 2, or 3 only   |
| reservedFor | string  | Yes      | Min 1, max 100 characters |
| notes       | string  | No       | Max 1000 characters       |

**Success Response (201)**

```json
{
  "success": true,
  "message": "Queue slot reserved successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "visitId": null,
    "queueDate": "2024-01-15T00:00:00.000Z",
    "queueNumber": 1,
    "isReserved": true,
    "reservedFor": "VIP Patient Name",
    "status": "WAITING",
    "checkedInAt": null,
    "calledAt": null,
    "startedAt": null,
    "servedAt": null,
    "createdAt": "2024-01-15T08:00:00.000Z",
    "updatedAt": "2024-01-15T08:00:00.000Z",
    "visit": null,
    "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" },
    "updatedBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" }
  }
}
```

**Error Responses**

| Status | Message                                   |
| ------ | ----------------------------------------- |
| `400`  | Queue number must be 1, 2, or 3           |
| `401`  | Unauthorized                              |
| `403`  | Insufficient role                         |
| `409`  | Queue number 1 is already taken for today |

---

### POST /queue/call-next

**Purpose:** Calls the next WAITING patient in the queue. Fails if another patient is currently IN_PROGRESS.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Status Transition:** `WAITING → IN_PROGRESS`

**Success Response (200)**

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
      "visitDate": "2024-01-15T00:00:00.000Z",
      "chiefComplaint": "Fever",
      "patient": {
        "id": "uuid",
        "fullName": "Mohamed Hassan",
        "phone": "01033334444",
        "mrn": "MRN004"
      }
    }
  }
}
```

**Error Responses**

| Status | Message                                                                              |
| ------ | ------------------------------------------------------------------------------------ |
| `401`  | Unauthorized                                                                         |
| `403`  | Insufficient role                                                                    |
| `404`  | No waiting patients in the queue                                                     |
| `409`  | Patient #3 is currently being served. Please complete or cancel before calling next. |

---

### POST /queue/reset

**Purpose:** Cancels all WAITING and IN_PROGRESS entries for today. SERVED and CANCELLED entries are unaffected.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Queue reset successfully. 8 entries cancelled.",
  "data": {
    "cancelled": 8
  }
}
```

**Error Responses**

| Status | Message           |
| ------ | ----------------- |
| `401`  | Unauthorized      |
| `403`  | Insufficient role |

---

### GET /queue

**Purpose:** Returns a paginated list of queue entries for the clinic. Defaults to today's queue.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter | Type    | Default | Description                             |
| --------- | ------- | ------- | --------------------------------------- |
| status    | enum    | —       | WAITING, IN_PROGRESS, SERVED, CANCELLED |
| date      | string  | Today   | Format YYYY-MM-DD                       |
| page      | integer | 1       | Page number, min 1                      |
| limit     | integer | 20      | Results per page, min 1, max 100        |

**Sorting:** `queueNumber` ascending

**Success Response (200)**

```json
{
  "success": true,
  "message": "Queue retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "clinicId": "uuid",
      "visitId": "uuid",
      "queueDate": "2024-01-15T00:00:00.000Z",
      "queueNumber": 1,
      "isReserved": false,
      "reservedFor": null,
      "status": "WAITING",
      "checkedInAt": "2024-01-15T08:00:00.000Z",
      "calledAt": null,
      "startedAt": null,
      "servedAt": null,
      "createdAt": "2024-01-15T08:00:00.000Z",
      "updatedAt": "2024-01-15T08:00:00.000Z",
      "visit": {
        "id": "uuid",
        "visitDate": "2024-01-15T00:00:00.000Z",
        "chiefComplaint": "Chest pain",
        "patient": {
          "id": "uuid",
          "fullName": "Ahmed Mohamed",
          "phone": "01012345678",
          "mrn": "MRN001"
        }
      },
      "createdBy": { "id": "uuid", "fullName": "Receptionist Sara" },
      "updatedBy": { "id": "uuid", "fullName": "Receptionist Sara" }
    }
  ],
  "meta": {
    "total": 12,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

**Error Responses**

| Status | Message             |
| ------ | ------------------- |
| `400`  | Invalid date format |
| `401`  | Unauthorized        |
| `403`  | Insufficient role   |

---

### GET /queue/status

**Purpose:** Returns a real-time snapshot of today's queue including currently serving patient, next patient, and counts.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Queue status retrieved successfully",
  "data": {
    "currentlyServing": {
      "id": "uuid",
      "queueNumber": 3,
      "status": "IN_PROGRESS",
      "checkedInAt": "2024-01-15T09:45:00.000Z",
      "calledAt": "2024-01-15T10:15:00.000Z",
      "startedAt": null,
      "visit": {
        "id": "uuid",
        "visitDate": "2024-01-15T00:00:00.000Z",
        "chiefComplaint": "Back pain",
        "patient": {
          "id": "uuid",
          "fullName": "Sara Ali",
          "phone": "01011112222",
          "mrn": "MRN003"
        }
      }
    },
    "nextWaiting": {
      "id": "uuid",
      "queueNumber": 4,
      "status": "WAITING",
      "visit": {
        "id": "uuid",
        "visitDate": "2024-01-15T00:00:00.000Z",
        "chiefComplaint": "Fever",
        "patient": {
          "id": "uuid",
          "fullName": "Mohamed Hassan",
          "phone": "01033334444",
          "mrn": "MRN004"
        }
      }
    },
    "waitingCount": 8,
    "servedCount": 2
  }
}
```

**Error Responses**

| Status | Message           |
| ------ | ----------------- |
| `401`  | Unauthorized      |
| `403`  | Insufficient role |

---

### GET /queue/statistics

**Purpose:** Returns aggregated queue statistics for a given day including counts and average times.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter | Type   | Default | Description       |
| --------- | ------ | ------- | ----------------- |
| date      | string | Today   | Format YYYY-MM-DD |

**Success Response (200)**

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

**Time Calculation Formulas**

| Field                     | Formula                   | Notes                                                                                                                                                                                                 |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `averageWaitTimeMinutes`  | `calledAt − checkedInAt`  | Averaged over `SERVED`, non-reserved entries that have `checkedInAt`, `calledAt`, `startedAt`, and `servedAt` populated. Negative values are excluded.                                              |
| `averageServeTimeMinutes` | `servedAt − startedAt`    | Same entry filter as above. Negative values are excluded.                                                                                                                                             |

If any required timestamp is `null`, that entry is excluded from the respective average. Reserved slots (`isReserved: true`) are excluded from average calculations. The counts (`total`, `waiting`, `inProgress`, `served`, `cancelled`) always include all entries regardless of timestamp availability.

> **Note:** Dashboard endpoints (`GET /dashboard/today`, `GET /dashboard/queue`, `GET /dashboard/analytics`) compute queue time averages differently: `averageWaitTimeMinutes = calledAt − createdAt` and `averageServeTimeMinutes = servedAt − calledAt`.

**Error Responses**

| Status | Message             |
| ------ | ------------------- |
| `400`  | Invalid date format |
| `401`  | Unauthorized        |
| `403`  | Insufficient role   |

---

### GET /queue/:id

**Purpose:** Returns full details of a single queue entry.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The queue entry's UUID |

**Request Body:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Queue entry retrieved successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "visitId": "uuid",
    "queueDate": "2024-01-15T00:00:00.000Z",
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
      "visitDate": "2024-01-15T00:00:00.000Z",
      "chiefComplaint": "Headache",
      "patient": {
        "id": "uuid",
        "fullName": "Ahmed Mohamed",
        "phone": "01012345678",
        "mrn": "MRN001"
      }
    },
    "createdBy": { "id": "uuid", "fullName": "Receptionist Sara" },
    "updatedBy": { "id": "uuid", "fullName": "Receptionist Sara" },
    "createdAt": "2024-01-15T09:00:00.000Z",
    "updatedAt": "2024-01-15T09:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message               |
| ------ | --------------------- |
| `400`  | Invalid UUID format   |
| `401`  | Unauthorized          |
| `403`  | Insufficient role     |
| `404`  | Queue entry not found |

---

### PATCH /queue/:id/serve

**Purpose:** Marks an IN_PROGRESS queue entry as SERVED.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The queue entry's UUID |

**Request Body:** None

**Status Transition:** `IN_PROGRESS → SERVED`

**Effect:** Sets `servedAt` on the queue entry. If the entry has a linked visit, also sets `visit.completedAt` to the same timestamp.

**Success Response (200)**

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

**Error Responses**

| Status | Message                                                  |
| ------ | -------------------------------------------------------- |
| `400`  | Cannot transition queue entry from "WAITING" to "SERVED" |
| `401`  | Unauthorized                                             |
| `403`  | Insufficient role                                        |
| `404`  | Queue entry not found                                    |

---

### PATCH /queue/:id/skip

**Purpose:** Sends an IN_PROGRESS patient back to WAITING status.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The queue entry's UUID |

**Request Body:** None

**Status Transition:** `IN_PROGRESS → WAITING`

**Effect:** Resets `calledAt` and `startedAt` to `null`. Preserves `checkedInAt`.

**Success Response (200)**

```json
{
  "success": true,
  "message": "Patient skipped successfully",
  "data": {
    "id": "uuid",
    "queueNumber": 3,
    "status": "WAITING",
    "calledAt": null,
    "startedAt": null
  }
}
```

**Error Responses**

| Status | Message                                                   |
| ------ | --------------------------------------------------------- |
| `400`  | Cannot transition queue entry from "WAITING" to "WAITING" |
| `401`  | Unauthorized                                              |
| `403`  | Insufficient role                                         |
| `404`  | Queue entry not found                                     |

---

### PATCH /queue/:id/recall

**Purpose:** Directly calls a specific WAITING patient to IN_PROGRESS. Fails if another patient is IN_PROGRESS.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The queue entry's UUID |

**Request Body:** None

**Status Transition:** `WAITING → IN_PROGRESS`

**Success Response (200)**

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

**Error Responses**

| Status | Message                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | Only waiting patients can be recalled                                             |
| `401`  | Unauthorized                                                                      |
| `403`  | Insufficient role                                                                 |
| `404`  | Queue entry not found                                                             |
| `409`  | Patient #2 is currently being served. Please complete or cancel before recalling. |

---

### PATCH /queue/:id/cancel

**Purpose:** Cancels a WAITING or IN_PROGRESS queue entry. Unlinks related SCHEDULED appointments.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The queue entry's UUID |

**Request Body:** None

**Status Transition:** `WAITING → CANCELLED` or `IN_PROGRESS → CANCELLED`

**Success Response (200)**

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

**Error Responses**

| Status | Message                                                    |
| ------ | ---------------------------------------------------------- |
| `400`  | Cannot transition queue entry from "SERVED" to "CANCELLED" |
| `401`  | Unauthorized                                               |
| `403`  | Insufficient role                                          |
| `404`  | Queue entry not found                                      |

---

### PATCH /queue/:id/start

**Purpose:** Starts the consultation for an `IN_PROGRESS` queue entry. Sets `startedAt` to the current timestamp. This marks the moment the doctor actually begins the appointment, which is distinct from `calledAt` (when the patient was summoned to the room).

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Required | Description            |
| --------- | ---- | -------- | ---------------------- |
| id        | UUID | Yes      | The queue entry's UUID |

**Request Body:** None

**Effect:** Sets `startedAt` on the queue entry. Does not change `status` — the entry remains `IN_PROGRESS`. If the entry has a linked visit, also sets `visit.startedAt` to the same timestamp.

**Queue Timestamp Sequence**

| Field         | Set by                                              | Meaning                                            |
| ------------- | --------------------------------------------------- | -------------------------------------------------- |
| `checkedInAt` | `POST /queue/check-in`                              | When the patient checked in to the queue.          |
| `calledAt`    | `POST /queue/call-next` / `PATCH /queue/:id/recall` | When the patient was called/summoned.              |
| `startedAt`   | `PATCH /queue/:id/start`                            | When the doctor actually started the consultation. |
| `servedAt`    | `PATCH /queue/:id/serve`                            | When the queue entry was marked as fully served.   |

**Success Response (200)**

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

**Error Responses**

| Status | Message                                                                                  |
| ------ | ---------------------------------------------------------------------------------------- |
| `400`  | Cannot start consultation: entry must be IN_PROGRESS (current: …)                        |
| `401`  | Unauthorized                                                                             |
| `403`  | Insufficient role                                                                        |
| `404`  | Queue entry not found                                                                    |
| `409`  | Consultation has already been started for this queue entry                               |

---

## Dashboard

### GET /dashboard/overview

**Purpose:** Returns high-level clinic statistics including patient counts, appointment counts, visit counts, and today's queue summary.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter | Type   | Default | Description                                           |
| --------- | ------ | ------- | ----------------------------------------------------- |
| date      | string | Today   | Scopes today's counts to this date, format YYYY-MM-DD |

**Success Response (200)**

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

**Error Responses**

| Status | Message             |
| ------ | ------------------- |
| `400`  | Invalid date format |
| `401`  | Unauthorized        |
| `403`  | Insufficient role   |

---

### GET /dashboard/today

**Purpose:** Returns a complete snapshot of today's activity including appointments, visits, and queue statistics.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter | Type   | Default | Description       |
| --------- | ------ | ------- | ----------------- |
| date      | string | Today   | Format YYYY-MM-DD |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Today's dashboard retrieved successfully",
  "data": {
    "date": "2024-01-15",
    "appointments": {
      "total": 18,
      "scheduled": 10,
      "completed": 6,
      "cancelled": 2,
      "list": [
        {
          "id": "uuid",
          "appointmentTime": "1970-01-01T09:00:00.000Z",
          "status": "SCHEDULED",
          "notes": null,
          "patient": {
            "id": "uuid",
            "fullName": "Ahmed Mohamed",
            "phone": "01012345678",
            "mrn": "MRN001"
          }
        }
      ]
    },
    "visits": {
      "total": 12,
      "list": [
        {
          "id": "uuid",
          "visitDate": "2024-01-15T00:00:00.000Z",
          "chiefComplaint": "Headache",
          "diagnosis": "Tension headache",
          "patient": {
            "id": "uuid",
            "fullName": "Ahmed Mohamed",
            "phone": "01012345678",
            "mrn": "MRN001"
          },
          "createdBy": { "id": "uuid", "fullName": "Dr. Ahmed Mohamed" }
        }
      ]
    },
    "queue": {
      "total": 15,
      "waiting": 8,
      "inProgress": 1,
      "served": 5,
      "cancelled": 1,
      "averageWaitTimeMinutes": 12.5,
      "averageServeTimeMinutes": 8.3
    }
  }
}
```

**Error Responses**

| Status | Message             |
| ------ | ------------------- |
| `400`  | Invalid date format |
| `401`  | Unauthorized        |
| `403`  | Insufficient role   |

---

### GET /dashboard/queue

**Purpose:** Returns a live queue dashboard with currently serving patient, next patient, full waiting list, and statistics.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter | Type    | Default | Description                  |
| --------- | ------- | ------- | ---------------------------- |
| date      | string  | Today   | Format YYYY-MM-DD            |
| page      | integer | 1       | Page number for waiting list |
| limit     | integer | 20      | Results per page, max 100    |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Queue dashboard retrieved successfully",
  "data": {
    "date": "2024-01-15",
    "currentlyServing": {
      "id": "uuid",
      "queueNumber": 3,
      "status": "IN_PROGRESS",
      "isReserved": false,
      "reservedFor": null,
      "calledAt": "2024-01-15T10:15:00.000Z",
      "servedAt": null,
      "createdAt": "2024-01-15T09:00:00.000Z",
      "visit": {
        "id": "uuid",
        "chiefComplaint": "Back pain",
        "patient": {
          "id": "uuid",
          "fullName": "Sara Ali",
          "phone": "01011112222",
          "mrn": "MRN003"
        }
      }
    },
    "nextWaiting": {
      "id": "uuid",
      "queueNumber": 4,
      "status": "WAITING",
      "isReserved": false,
      "reservedFor": null,
      "calledAt": null,
      "servedAt": null,
      "createdAt": "2024-01-15T09:10:00.000Z",
      "visit": {
        "id": "uuid",
        "chiefComplaint": "Fever",
        "patient": {
          "id": "uuid",
          "fullName": "Mohamed Hassan",
          "phone": "01033334444",
          "mrn": "MRN004"
        }
      }
    },
    "waitingList": [],
    "statistics": {
      "total": 15,
      "waiting": 8,
      "inProgress": 1,
      "served": 5,
      "cancelled": 1,
      "averageWaitTimeMinutes": 12.5,
      "averageServeTimeMinutes": 8.3
    }
  }
}
```

**Error Responses**

| Status | Message             |
| ------ | ------------------- |
| `400`  | Invalid date format |
| `401`  | Unauthorized        |
| `403`  | Insufficient role   |

---

### GET /dashboard/appointments

**Purpose:** Returns upcoming, completed, and cancelled appointments with summary counts.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter | Type    | Default      | Description                    |
| --------- | ------- | ------------ | ------------------------------ |
| fromDate  | string  | Today        | Start of date range YYYY-MM-DD |
| toDate    | string  | End of month | End of date range YYYY-MM-DD   |
| page      | integer | 1            | Page number                    |
| limit     | integer | 10           | Results per page, max 100      |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Appointments dashboard retrieved successfully",
  "data": {
    "upcoming": [
      {
        "id": "uuid",
        "appointmentDate": "2024-02-01T00:00:00.000Z",
        "appointmentTime": "1970-01-01T09:30:00.000Z",
        "status": "SCHEDULED",
        "notes": null,
        "patient": {
          "id": "uuid",
          "fullName": "Ahmed Mohamed",
          "phone": "01012345678",
          "mrn": "MRN001"
        }
      }
    ],
    "completed": [],
    "cancelled": [],
    "summary": {
      "totalUpcoming": 15,
      "totalCompleted": 8,
      "totalCancelled": 2
    }
  }
}
```

**Error Responses**

| Status | Message             |
| ------ | ------------------- |
| `400`  | Invalid date format |
| `401`  | Unauthorized        |
| `403`  | Insufficient role   |

---

### GET /dashboard/patients

**Purpose:** Returns patient statistics including recently registered, recently visited, gender breakdown, and counts.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter | Type    | Default | Description               |
| --------- | ------- | ------- | ------------------------- |
| page      | integer | 1       | Page number               |
| limit     | integer | 10      | Results per page, max 100 |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Patients dashboard retrieved successfully",
  "data": {
    "totalActive": 245,
    "totalDeleted": 5,
    "recentlyRegistered": [
      {
        "id": "uuid",
        "fullName": "Ahmed Mohamed",
        "phone": "01012345678",
        "mrn": "MRN001",
        "gender": "MALE",
        "createdAt": "2024-01-15T10:00:00.000Z"
      }
    ],
    "recentlyVisited": [
      {
        "id": "uuid",
        "fullName": "Sara Ali",
        "phone": "01011112222",
        "mrn": "MRN003",
        "lastVisit": "2024-01-15T00:00:00.000Z"
      }
    ],
    "genderBreakdown": {
      "male": 130,
      "female": 110,
      "other": 5
    }
  }
}
```

**Error Responses**

| Status | Message                  |
| ------ | ------------------------ |
| `400`  | Invalid query parameters |
| `401`  | Unauthorized             |
| `403`  | Insufficient role        |

---

### GET /dashboard/analytics

**Purpose:** Returns time-series analytics including visits per day, appointments per day, patients registered per month, queue metrics, and appointment metrics.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters**

| Parameter | Type   | Default     | Description                          |
| --------- | ------ | ----------- | ------------------------------------ |
| fromDate  | string | 30 days ago | Start of analytics period YYYY-MM-DD |
| toDate    | string | Today       | End of analytics period YYYY-MM-DD   |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Analytics retrieved successfully",
  "data": {
    "period": {
      "from": "2023-12-16",
      "to": "2024-01-15"
    },
    "visitsPerDay": [
      { "date": "2024-01-15", "count": 12 },
      { "date": "2024-01-14", "count": 10 }
    ],
    "appointmentsPerDay": [
      { "date": "2024-01-15", "count": 18 },
      { "date": "2024-01-14", "count": 15 }
    ],
    "patientsRegisteredPerMonth": [
      { "month": "2024-01", "count": 25 },
      { "month": "2023-12", "count": 30 }
    ],
    "queueMetrics": {
      "totalServed": 150,
      "totalCancelled": 12,
      "completionRate": 92.6,
      "cancellationRate": 7.4,
      "averageWaitTimeMinutes": 14.2,
      "averageServeTimeMinutes": 9.8
    },
    "appointmentMetrics": {
      "totalCompleted": 200,
      "totalCancelled": 15,
      "completionRate": 93.0,
      "cancellationRate": 7.0
    }
  }
}
```

**Error Responses**

| Status | Message                                    |
| ------ | ------------------------------------------ |
| `400`  | fromDate must be before or equal to toDate |
| `400`  | Invalid date format                        |
| `401`  | Unauthorized                               |
| `403`  | Insufficient role                          |

---

## Clinic Settings

### GET /clinic-settings

**Purpose:** Returns the clinic's configuration including working hours, max patients per day, and clinic information. Auto-creates default settings if none exist.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** None

**Query Parameters:** None

**Success Response (200)**

```json
{
  "success": true,
  "message": "Clinic settings retrieved successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "workingHours": {
      "monday": { "open": "09:00", "close": "17:00", "isOpen": true },
      "tuesday": { "open": "09:00", "close": "17:00", "isOpen": true },
      "wednesday": { "open": "09:00", "close": "17:00", "isOpen": true },
      "thursday": { "open": "09:00", "close": "17:00", "isOpen": true },
      "friday": { "open": "09:00", "close": "17:00", "isOpen": true },
      "saturday": { "open": "09:00", "close": "14:00", "isOpen": false },
      "sunday": { "open": "09:00", "close": "14:00", "isOpen": false }
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
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

**Error Responses**

| Status | Message           |
| ------ | ----------------- |
| `401`  | Unauthorized      |
| `403`  | Insufficient role |
| `404`  | Clinic not found  |

---

### PATCH /clinic-settings

**Purpose:** Updates clinic configuration. Only updates provided fields. Can update clinic info and settings fields in one request via a transaction.

**Authentication:** Required

**Roles:** DOCTOR, RECEPTIONIST

**Headers:**

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

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
    "monday": { "open": "08:00", "close": "18:00", "isOpen": true },
    "tuesday": { "open": "08:00", "close": "18:00", "isOpen": true },
    "wednesday": { "open": "08:00", "close": "18:00", "isOpen": true },
    "thursday": { "open": "08:00", "close": "18:00", "isOpen": true },
    "friday": { "open": "08:00", "close": "18:00", "isOpen": true },
    "saturday": { "open": "09:00", "close": "14:00", "isOpen": true },
    "sunday": { "open": "09:00", "close": "14:00", "isOpen": false }
  }
}
```

**Validation Rules**

| Field               | Type    | Required | Rules                                                                      |
| ------------------- | ------- | -------- | -------------------------------------------------------------------------- |
| name                | string  | No       | Min 2, max 100 characters                                                  |
| phone               | string  | No       | Min 7, max 20 chars, valid phone format, nullable                          |
| email               | string  | No       | Valid email format, max 100 chars, nullable                                |
| address             | string  | No       | Min 1, max 255 characters, nullable                                        |
| maxPatientsPerDay   | integer | No       | Min 1, max 1000                                                            |
| appointmentDuration | integer | No       | Duration of each appointment slot in minutes. Default: `30`                |
| gracePeriod         | integer | No       | Late-arrival grace period in minutes. Default: `15`                        |
| delayThreshold      | integer | No       | Threshold in minutes before a delay is flagged. Default: `20`              |
| workingHours        | object  | No       | Must include all 7 days with open (HH:MM), close (HH:MM), isOpen (boolean) |

**workingHours Day Object**

```json
{
  "open": "09:00",
  "close": "17:00",
  "isOpen": true
}
```

**Success Response (200)**

```json
{
  "success": true,
  "message": "Clinic settings updated successfully",
  "data": {
    "id": "uuid",
    "clinicId": "uuid",
    "workingHours": {
      "monday": { "open": "08:00", "close": "18:00", "isOpen": true },
      "tuesday": { "open": "08:00", "close": "18:00", "isOpen": true },
      "wednesday": { "open": "08:00", "close": "18:00", "isOpen": true },
      "thursday": { "open": "08:00", "close": "18:00", "isOpen": true },
      "friday": { "open": "08:00", "close": "18:00", "isOpen": true },
      "saturday": { "open": "09:00", "close": "14:00", "isOpen": true },
      "sunday": { "open": "09:00", "close": "14:00", "isOpen": false }
    },
    "maxPatientsPerDay": 60,
    "appointmentDuration": 30,
    "gracePeriod": 15,
    "delayThreshold": 20,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z",
    "clinic": {
      "id": "uuid",
      "name": "Al Shifa Medical Center",
      "phone": "0223456789",
      "email": "info@alshifa.com",
      "address": "Cairo, Egypt",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

**Error Responses**

| Status | Message                                        |
| ------ | ---------------------------------------------- |
| `400`  | At least one field must be provided for update |
| `400`  | Validation failed                              |
| `400`  | Invalid email address                          |
| `400`  | Invalid phone number format                    |
| `400`  | Max patients per day must be at least 1        |
| `400`  | Open time must be in HH:MM format              |
| `401`  | Unauthorized                                   |
| `403`  | Insufficient role                              |
| `404`  | Clinic not found                               |

---

# Complete Endpoint Index

| #   | Method | URL                                  | Auth | Roles                |
| --- | ------ | ------------------------------------ | ---- | -------------------- |
| 1   | GET    | `/api/v1/health`                     | No   | —                    |
| 2   | POST   | `/api/v1/auth/login`                 | No   | —                    |
| 3   | POST   | `/api/v1/auth/refresh`               | No   | —                    |
| 4   | POST   | `/api/v1/auth/logout`                | Yes  | DOCTOR, RECEPTIONIST |
| 5   | GET    | `/api/v1/auth/me`                    | Yes  | DOCTOR, RECEPTIONIST |
| 6   | PATCH  | `/api/v1/auth/change-password`       | Yes  | DOCTOR, RECEPTIONIST |
| 7   | POST   | `/api/v1/patients`                   | Yes  | DOCTOR, RECEPTIONIST |
| 8   | GET    | `/api/v1/patients`                   | Yes  | DOCTOR, RECEPTIONIST |
| 9   | GET    | `/api/v1/patients/:id`               | Yes  | DOCTOR, RECEPTIONIST |
| 10  | PATCH  | `/api/v1/patients/:id`               | Yes  | DOCTOR, RECEPTIONIST |
| 11  | DELETE | `/api/v1/patients/:id`               | Yes  | DOCTOR, RECEPTIONIST |
| 12  | PATCH  | `/api/v1/patients/:id/restore`       | Yes  | DOCTOR, RECEPTIONIST |
| 13  | POST   | `/api/v1/appointments`               | Yes  | DOCTOR, RECEPTIONIST |
| 14  | GET    | `/api/v1/appointments`               | Yes  | DOCTOR, RECEPTIONIST |
| 15  | GET    | `/api/v1/appointments/:id`           | Yes  | DOCTOR, RECEPTIONIST |
| 16  | PATCH  | `/api/v1/appointments/:id`           | Yes  | DOCTOR, RECEPTIONIST |
| 17  | PATCH  | `/api/v1/appointments/:id/cancel`    | Yes  | DOCTOR, RECEPTIONIST |
| 18  | PATCH  | `/api/v1/appointments/:id/complete`  | Yes  | DOCTOR, RECEPTIONIST |
| 19  | POST   | `/api/v1/visits`                     | Yes  | DOCTOR               |
| 20  | GET    | `/api/v1/visits`                     | Yes  | DOCTOR, RECEPTIONIST |
| 21  | GET    | `/api/v1/visits/:id`                 | Yes  | DOCTOR, RECEPTIONIST |
| 22  | GET    | `/api/v1/patients/:patientId/visits` | Yes  | DOCTOR, RECEPTIONIST |
| 23  | PATCH  | `/api/v1/visits/:id`                 | Yes  | DOCTOR               |
| 24  | DELETE | `/api/v1/visits/:id`                 | Yes  | DOCTOR               |
| 25  | POST   | `/api/v1/queue/check-in`             | Yes  | DOCTOR, RECEPTIONIST |
| 26  | POST   | `/api/v1/queue/reserve`              | Yes  | DOCTOR, RECEPTIONIST |
| 27  | POST   | `/api/v1/queue/call-next`            | Yes  | DOCTOR, RECEPTIONIST |
| 28  | POST   | `/api/v1/queue/reset`                | Yes  | DOCTOR, RECEPTIONIST |
| 29  | GET    | `/api/v1/queue`                      | Yes  | DOCTOR, RECEPTIONIST |
| 30  | GET    | `/api/v1/queue/status`               | Yes  | DOCTOR, RECEPTIONIST |
| 31  | GET    | `/api/v1/queue/statistics`           | Yes  | DOCTOR, RECEPTIONIST |
| 32  | GET    | `/api/v1/queue/:id`                  | Yes  | DOCTOR, RECEPTIONIST |
| 33  | PATCH  | `/api/v1/queue/:id/serve`            | Yes  | DOCTOR, RECEPTIONIST |
| 34  | PATCH  | `/api/v1/queue/:id/start`            | Yes  | DOCTOR, RECEPTIONIST |
| 35  | PATCH  | `/api/v1/queue/:id/skip`             | Yes  | DOCTOR, RECEPTIONIST |
| 36  | PATCH  | `/api/v1/queue/:id/recall`           | Yes  | DOCTOR, RECEPTIONIST |
| 37  | PATCH  | `/api/v1/queue/:id/cancel`           | Yes  | DOCTOR, RECEPTIONIST |
| 38  | GET    | `/api/v1/dashboard/overview`         | Yes  | DOCTOR, RECEPTIONIST |
| 39  | GET    | `/api/v1/dashboard/today`            | Yes  | DOCTOR, RECEPTIONIST |
| 40  | GET    | `/api/v1/dashboard/queue`            | Yes  | DOCTOR, RECEPTIONIST |
| 41  | GET    | `/api/v1/dashboard/appointments`     | Yes  | DOCTOR, RECEPTIONIST |
| 42  | GET    | `/api/v1/dashboard/patients`         | Yes  | DOCTOR, RECEPTIONIST |
| 43  | GET    | `/api/v1/dashboard/analytics`        | Yes  | DOCTOR, RECEPTIONIST |
| 44  | GET    | `/api/v1/clinic-settings`            | Yes  | DOCTOR, RECEPTIONIST |
| 45  | PATCH  | `/api/v1/clinic-settings`            | Yes  | DOCTOR, RECEPTIONIST |

---

# Frontend Integration Guide

## Axios Configuration (Next.js)

```typescript
// lib/axios.ts
import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — refresh tokens automatically
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      try {
        const refreshToken = localStorage.getItem("refreshToken");
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          { refreshToken }
        );

        localStorage.setItem("accessToken", data.data.accessToken);
        localStorage.setItem("refreshToken", data.data.refreshToken);

        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

## Token Storage

```typescript
// After login
localStorage.setItem("accessToken", data.tokens.accessToken);
localStorage.setItem("refreshToken", data.tokens.refreshToken);

// After logout
localStorage.removeItem("accessToken");
localStorage.removeItem("refreshToken");
```

## Enum Reference

```typescript
// Use these exact string values in request bodies

export type Role = "DOCTOR" | "RECEPTIONIST";
export type Gender = "MALE" | "FEMALE" | "OTHER";
export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";
export type QueueStatus = "WAITING" | "IN_PROGRESS" | "SERVED" | "CANCELLED";
```

## Date Formats

| Field Type          | Format       | Example                    |
| ------------------- | ------------ | -------------------------- |
| Date only           | `YYYY-MM-DD` | `2024-01-15`               |
| Time only           | `HH:MM`      | `09:30`                    |
| DateTime (response) | ISO 8601     | `2024-01-15T09:30:00.000Z` |
