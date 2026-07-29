# 🚀 Clinic Management System API Reference

> **Base URL**
>
> ```
> /api/v1
> ```

---

# ❤️ Health

## Health Check

| Method | Endpoint  |
| ------ | --------- |
| GET    | `/health` |

### Body

None

---

# 🔐 Authentication

## Login

| Method | Endpoint      |
| ------ | ------------- |
| POST   | `/auth/login` |

### Body

```json
{
  "email": "admin@clinic.com",
  "password": "NewAdmin@456"
}
```

Admin
{
"success": true,
"message": "Login successful",
"data": {
"user": {
"id": "217f681d-2d2c-4eb9-a654-d9e02c64decc",
"clinicId": "bd2ddf1a-5508-4dad-9e68-093897d44d8f",
"email": "admin@clinic.com",
"fullName": "admin",
"role": "DOCTOR",
"isActive": true,
"lastLogin": "2026-07-29T11:53:10.464Z",
"createdAt": "2026-07-28T21:24:00.616Z",
"updatedAt": "2026-07-29T11:55:22.013Z"
},
"tokens": {
"accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMTdmNjgxZC0yZDJjLTRlYjktYTY1NC1kOWUwMmM2NGRlY2MiLCJjbGluaWNJZCI6ImJkMmRkZjFhLTU1MDgtNGRhZC05ZTY4LTA5Mzg5N2Q0NGQ4ZiIsInJvbGUiOiJET0NUT1IiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzg1MzU2NDUxLCJleHAiOjE3ODU5NjEyNTF9.yYabmOAMahalWhBBaPw0nOEUT0IpQWKaOJWATumfrEk",
"refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMTdmNjgxZC0yZDJjLTRlYjktYTY1NC1kOWUwMmM2NGRlY2MiLCJjbGluaWNJZCI6ImJkMmRkZjFhLTU1MDgtNGRhZC05ZTY4LTA5Mzg5N2Q0NGQ4ZiIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzg1MzU2NDUxLCJleHAiOjE3ODc5NDg0NTF9.yOnGZtalWiuH3ud4D2wbigwRcrvll1EfJEGNlZZM0v4"
}
}
}

---

## Refresh Token

| Method | Endpoint        |
| ------ | --------------- |
| POST   | `/auth/refresh` |

### Body

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

---

## Logout

| Method | Endpoint       |
| ------ | -------------- |
| POST   | `/auth/logout` |

### Body

None

---

## Get Current User

| Method | Endpoint   |
| ------ | ---------- |
| GET    | `/auth/me` |

### Body

None

---

## Change Password

| Method | Endpoint                |
| ------ | ----------------------- |
| PATCH  | `/auth/change-password` |

### Body

```json
{
  "currentPassword": "Admin@123",
  "newPassword": "NewAdmin@456",
  "confirmPassword": "NewAdmin@456"
}
```

---

# 👤 Patients

## Create Patient

| Method | Endpoint    |
| ------ | ----------- |
| POST   | `/patients` |

### Body

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

{
"id": "b97c81d0-ebf3-4f95-b8a6-dd31af9d5dc6",
"clinicId": "bd2ddf1a-5508-4dad-9e68-093897d44d8f",
"mrn": "MRN003",
"fullName": "مازن مصطفى",
"phone": "01128199955",
"dateOfBirth": "1990-05-12T00:00:00.000Z",
"gender": "MALE",
"address": "Cairo, Egypt",
"notes": "Diabetic patient",
"deletedAt": null,
"createdAt": "2026-07-29T11:56:09.983Z",
"updatedAt": "2026-07-29T11:56:09.983Z",
"createdBy": {
"id": "217f681d-2d2c-4eb9-a654-d9e02c64decc",
"fullName": "admin"
},
"updatedBy": {
"id": "217f681d-2d2c-4eb9-a654-d9e02c64decc",
"fullName": "admin"
}
},

---

## List Patients

| Method | Endpoint    |
| ------ | ----------- |
| GET    | `/patients` |

### Query Examples

```http
GET /patients
GET /patients?search=Ahmed
GET /patients?gender=MALE
GET /patients?includeDeleted=true
GET /patients?page=1&limit=10
```

### Body

None

---

## Get Patient by ID

| Method | Endpoint        |
| ------ | --------------- |
| GET    | `/patients/:id` |

### Body

None

---

## Update Patient

| Method | Endpoint        |
| ------ | --------------- |
| PATCH  | `/patients/:id` |

### Body

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

---

## Delete Patient

| Method | Endpoint        |
| ------ | --------------- |
| DELETE | `/patients/:id` |

### Body

None

---

## Restore Patient

| Method | Endpoint                |
| ------ | ----------------------- |
| PATCH  | `/patients/:id/restore` |

### Body

None

---

# 📅 Appointments

## Create Appointment

| Method | Endpoint        |
| ------ | --------------- |
| POST   | `/appointments` |

### Body

```json
{
  "patientId": "uuid",
  "appointmentDate": "2024-02-01",
  "appointmentTime": "09:30",
  "notes": "Follow-up visit"
}
```

---

## List Appointments

| Method | Endpoint        |
| ------ | --------------- |
| GET    | `/appointments` |

### Query Examples

```http
GET /appointments
GET /appointments?status=SCHEDULED
GET /appointments?patientId=uuid
GET /appointments?date=2024-02-01
GET /appointments?fromDate=2024-02-01&toDate=2024-02-28
GET /appointments?search=Ahmed
GET /appointments?page=1&limit=10
```

### Body

None

{
"id": "be6e89bd-694b-4804-97d6-f6d03e94d583",
"clinicId": "bd2ddf1a-5508-4dad-9e68-093897d44d8f",
"patientId": "b97c81d0-ebf3-4f95-b8a6-dd31af9d5dc6",
"visitId": null,
"appointmentDate": "2026-08-01T00:00:00.000Z",
"appointmentTime": "1970-01-01T09:30:00.000Z",
"status": "COMPLETED",
"notes": "Follow-up visit",
"createdAt": "2026-07-29T11:59:43.312Z",
"updatedAt": "2026-07-29T12:02:14.434Z",
"patient": {
"id": "b97c81d0-ebf3-4f95-b8a6-dd31af9d5dc6",
"fullName": "مازن مصطفى",
"phone": "01128199955",
"mrn": "MRN003"
},

---

## Get Appointment by ID

| Method | Endpoint            |
| ------ | ------------------- |
| GET    | `/appointments/:id` |

### Body

None

---

## Update Appointment

| Method | Endpoint            |
| ------ | ------------------- |
| PATCH  | `/appointments/:id` |

### Body

```json
{
  "appointmentDate": "2024-02-05",
  "appointmentTime": "10:00",
  "notes": "Rescheduled by patient request"
}
```

---

## Cancel Appointment

| Method | Endpoint                   |
| ------ | -------------------------- |
| PATCH  | `/appointments/:id/cancel` |

### Body

None

---

## Complete Appointment

| Method | Endpoint                     |
| ------ | ---------------------------- |
| PATCH  | `/appointments/:id/complete` |

### Body

None

---

# 🎟️ Queue

## Check In Patient

| Method | Endpoint          |
| ------ | ----------------- |
| POST   | `/queue/check-in` |

### Body

```json
{
  "patientId": "uuid",
  "appointmentId": "uuid",
  "chiefComplaint": "Headache and fever",
  "notes": "Patient looks pale"
}
```

---

## Reserve Queue Slot

| Method | Endpoint         |
| ------ | ---------------- |
| POST   | `/queue/reserve` |

### Body

```json
{
  "queueNumber": 1,
  "reservedFor": "VIP Patient Name",
  "notes": "Director referral"
}
```

---

## Call Next Patient

| Method | Endpoint           |
| ------ | ------------------ |
| POST   | `/queue/call-next` |

### Body

None

---

## Reset Queue

| Method | Endpoint       |
| ------ | -------------- |
| POST   | `/queue/reset` |

### Body

None

---

## Get Queue

| Method | Endpoint |
| ------ | -------- |
| GET    | `/queue` |

### Query Examples

```http
GET /queue
GET /queue?status=WAITING
GET /queue?date=2024-01-15
GET /queue?page=1&limit=20
```

### Body

None

---

## Get Queue Status

| Method | Endpoint        |
| ------ | --------------- |
| GET    | `/queue/status` |

### Body

None

---

## Get Queue Statistics

| Method | Endpoint            |
| ------ | ------------------- |
| GET    | `/queue/statistics` |

### Query Examples

```http
GET /queue/statistics
GET /queue/statistics?date=2024-01-15
```

### Body

None

---

## Get Queue Entry by ID

| Method | Endpoint     |
| ------ | ------------ |
| GET    | `/queue/:id` |

### Body

None

---

## Mark Patient as Served

| Method | Endpoint           |
| ------ | ------------------ |
| PATCH  | `/queue/:id/serve` |

### Body

None

---

## Skip Patient

| Method | Endpoint          |
| ------ | ----------------- |
| PATCH  | `/queue/:id/skip` |

### Body

None

---

## Recall Patient

| Method | Endpoint            |
| ------ | ------------------- |
| PATCH  | `/queue/:id/recall` |

### Body

None

---

## Cancel Queue Entry

| Method | Endpoint            |
| ------ | ------------------- |
| PATCH  | `/queue/:id/cancel` |

### Body

None

---
