# 📘 Clinic Backend — API Documentation (مستخرجة من الكود فعليًا)

> هذا الملف اتعمل بعد ما قريت الكود الفعلي كامل (`src/modules/**`, `src/middleware/**`, `src/config/**`, `prisma/schema.prisma`) — مش ملفات الـ README أو الـ Api-Doc.md أو الـ Postman guide الموجودين في الريبو، لأن دول بيوصفوا نسخة قديمة (in-memory, Next.js routes) والكود الحالي Express + Prisma + PostgreSQL مختلف تمامًا.

**الـ Stack الفعلي:**
- Express.js (TypeScript) — مش Next.js API routes
- PostgreSQL via Prisma ORM
- JWT (access + refresh tokens) via `jsonwebtoken` + bcrypt
- Zod للـ validation
- Multi-tenant: كل عيادة (`Clinic`) لها بياناتها منعزلة بالكامل (`clinicId`)

**Base URL:**
```
http://localhost:5000/api/v1
```
(البورت جاي من `PORT` env var، افتراضيًا `5000`. كل الـ routes تحت `/api/v1` ما عدا `GET /api/health`).

---

## 1. الـ Response Envelope (شكل الرد موحّد في كل الـ API)

### نجاح
```json
{
  "success": true,
  "message": "Human readable message",
  "data": { }
}
```

### نجاح مع Pagination (listing endpoints)
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

### فشل (أي خطأ — validation, auth, not found, server error)
```json
{
  "success": false,
  "message": "Human readable message",
  "errors": [
    { "field": "email", "message": "Invalid email" }
  ]
}
```
- `errors` بيظهر بس لو فيه validation errors (من Zod) — كل عنصر فيه `field` (الـ path بتاع الحقل) و`message`.
- `stack` ممكن يظهر في الـ development mode بس لو الخطأ غير متوقع (bug)، مش في production.

**قاعدة مهمة للفرونت:** اعتمد دايمًا على `success` boolean مش على الـ HTTP status code بس، وكل رسائل الأخطاء جاهزة للعرض مباشرة (`message` و `errors[].message`).

### HTTP Status Codes المستخدمة فعليًا
| Code | المعنى في الكود |
|---|---|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request (validation, malformed JSON, بيانات ناقصة) |
| 401 | Unauthorized (مفيش token / token غلط / منتهي / متلغي) |
| 403 | Forbidden (role مش مسموح له / doctor بيحاول يوصل لبيانات doctor تاني) |
| 404 | Not Found |
| 409 | Conflict (duplicate — زي email مستخدم، أو MRN مكرر) |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests (rate limit) |
| 500 | Internal Server Error |
| 503 | Service Unavailable (قاعدة البيانات مش واصلة) |

---

## 2. Authentication & Authorization

فيه **نظامين منفصلين تمامًا**، كل واحد ليه secret وmiddleware خاص بيه:

1. **Clinic API** (`/auth/*` وكل الـ endpoints العادية) — للـ `DOCTOR` و`RECEPTIONIST`.
2. **Platform Admin API** (`/admin/*`) — لصاحب المنصة (super admin) اللي بيدير العيادات نفسها. مختلف تمامًا، له token منفصل (`ADMIN_JWT_SECRET`) ومفيهوش refresh token.

### 2.1 Clinic Auth — Access + Refresh Tokens

- **Access Token:** عمره الافتراضي `15m` (`JWT_EXPIRES_IN`), بيتبعت في كل request.
- **Refresh Token:** عمره الافتراضي `30d` (`JWT_REFRESH_EXPIRES_IN`), بيتخزن كـ row في جدول `refresh_tokens` عشان يتم الـ revoke بتاعه وقت الحاجة.
- كل refresh بيعمل **rotation**: التوكن القديم يتلغي (`revokedAt`) وتوكن جديد يتولد. لو حد استخدم refresh token اتلغى قبل كده (إعادة استخدام) → كل الجلسات (sessions) بتاعة اليوزر بتتلغي تلقائيًا (كإجراء أمان ضد سرقة التوكن).
- الـ Access Token بيتبعت في الهيدر:
```
Authorization: Bearer <accessToken>
```

**JWT Access Token Payload:**
```json
{
  "sub": "user-uuid",
  "clinicId": "clinic-uuid",
  "role": "DOCTOR" | "RECEPTIONIST",
  "tv": 0,
  "type": "access"
}
```
> `tv` (tokenVersion) بيتقارن مع القيمة الحالية في الداتابيز على كل request — لو اتغيرت (logout all / تغيير باسورد / deactivate) التوكن القديم بيترفض فورًا حتى لو لسه مش منتهي.

**ملاحظة مهمة للفرونت:** الـ role والـ clinicId اللي بتوصل في `req.user` مش من التوكن بس — بيتقرأوا من الداتابيز في كل request (`authMiddleware`)، يعني لو الدكتور اتحوّل لـ clinic admin أو اتعمله deactivate، ده بيأثر فورًا من غير ما ينتظر التوكن ينتهي.

### 2.2 Auth Endpoints (Clinic) — `/auth`

#### `POST /auth/login`
- **Auth:** لا
- **Rate limit:** 10 محاولات / 15 دقيقة / IP (`authLimiter`)
- **Body:**
```json
{
  "email": "doctor@clinic.com",
  "password": "string (min 8 chars)",
  "clinicId": "uuid (اختياري)"
}
```
> `clinicId` مطلوب بس لو نفس الإيميل موجود في أكتر من عيادة (الإيميل unique على مستوى العيادة مش على مستوى النظام كله). لو مبعتوش وفيه تعارض، الرد هيكون `409 Conflict` ورسالة "This email is used by more than one clinic. Please provide clinicId."
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
- **أخطاء:** `401` لو الإيميل أو الباسورد غلط، `403` لو الحساب `isActive: false`، `409` لو الإيميل مكرر في أكتر من عيادة.

#### `POST /auth/refresh`
- **Auth:** لا (لكن بياخد الـ refresh token في الـ body)
- **Rate limit:** نفس `authLimiter`
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
> **مهم:** الـ refreshToken القديم بيتلغي فورًا — لازم الفرونت يستبدل التوكنين الاتنين (access + refresh) بعد كل refresh، ومينفعش يستخدم نفس الـ refreshToken تاني.
- **401:** لو التوكن غلط / منتهي / متلغي.

#### `POST /auth/logout` 🔒
- **Auth:** Bearer access token
- **Body:**
```json
{ "refreshToken": "eyJ... (اختياري)", "allDevices": false }
```
- لازم تبعت واحد منهم على الأقل. `refreshToken` بيلغي الجلسة دي بس، `allDevices: true` بيلغي كل الجلسات (كل الأجهزة).
- **Response (200):** `data: null`

#### `GET /auth/me` 🔒
- **Auth:** Bearer access token
- **Response (200):** نفس شكل `user` اللي في اللوجين.

#### `PATCH /auth/change-password` 🔒
- **Auth:** Bearer access token
- **Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string (8+ حروف، فيها حرف كبير وصغير ورقم ورمز خاص)",
  "confirmPassword": "string (لازم يطابق newPassword)"
}
```
- بعد نجاح العملية: **كل الجلسات التانية بتتلغي**، والجلسة الحالية بتاخد توكنات جديدة.
- **Response (200):**
```json
{ "success": true, "message": "Password changed successfully", "data": { "tokens": { "accessToken": "...", "refreshToken": "..." } } }
```
- **401** لو `currentPassword` غلط.

### 2.3 الـ Roles

| Role | الوصف |
|---|---|
| `DOCTOR` | دكتور — ممكن يكون كمان `isClinicAdmin: true` لو هو المسؤول عن إعدادات العيادة وإدارة الموظفين |
| `RECEPTIONIST` | موظف استقبال — بيشوف كل الدكاترة، مايقدرش يشوف بيانات إكلينيكية حساسة (diagnosis/treatment/prescription) |

**قاعدة الـ Scoping (مهمة جدًا للفرونت):**
- أي request جاي من `DOCTOR` → **مقفول تلقائيًا على بياناته هو بس** (مواعيده، طابوره، زياراته). لو حاول يبعت `doctorId` لدكتور تاني → `403 Forbidden`. لو حاول يوصل لـ record (appointment/queue entry) مش بتاعه → `404 Not Found` (مش 403 — عشان مايتأكدش حتى إن الـ record موجود).
- `RECEPTIONIST` → بيشوف كل الدكاترة، وممكن يفلتر بـ `?doctorId=` لأي دكتور في نفس العيادة.

**Clinic Admin (`isClinicAdmin`):** خاصية إضافية على حساب `DOCTOR` بس — بتدّيه صلاحية تعديل إعدادات العيادة وإدارة حسابات الموظفين (`requireClinicAdmin` middleware). دكتور عادي من غيرها مايقدرش يوصل للـ endpoints دي.

### 2.4 إخفاء البيانات الإكلينيكية عن الـ Reception (Redaction)

على أي endpoint راجع منه بيانات Visit (appointments, visits, queue, dashboard...)، لو اليوزر اللي عامل login هو `RECEPTIONIST`، في middleware (`redactClinicalDataForReception`) بيشيل الحقول دي **تلقائيًا من الـ JSON response قبل ما يوصل للفرونت**:
```
diagnosis, treatment, prescription
```
يعني الفرونت لو بيعمل render لشاشة الـ reception، الحقول دي هتبقى مش موجودة في الـ object خالص (مش `null` — غير موجودة أصلًا). لازم الفرونت يتعامل مع احتمالية إن الحقل مش موجود (`undefined`) مش بس `null`.

---

## 3. Modules — Clinic API (كل الـ routes تحت `/api/v1`)

### خريطة الـ Routers (من `src/routes/index.ts`)
```
GET  /api/v1/health                      ← health check (بدون auth)
     /api/v1/auth/*                       ← شرحناه فوق
     /api/v1/patients/*
     /api/v1/appointments/*
     /api/v1/queue/*
     /api/v1/visits/*
     /api/v1/patients/:patientId/visits   ← زيارات مريض معيّن
     /api/v1/dashboard/*
     /api/v1/clinic-settings/*
     /api/v1/public/*                     ← بدون auth (الموقع العام / شاشة الانتظار)
     /api/v1/users/*
     /api/v1/doctors/*
     /api/v1/admin/*                      ← نظام منفصل (Platform Admin)
```

---

### 3.1 `GET /health`
- بدون auth. بيرجع:
```json
{
  "success": true,
  "message": "Service is healthy",
  "data": { "status": "healthy", "timestamp": "...", "uptime": 123.45, "environment": "development" }
}
```

---

### 3.2 Patients — `/patients` 🔒 (DOCTOR, RECEPTIONIST)

> كل الـ routes هنا فيها `redactClinicalDataForReception` (مش بتأثر على الـ patient object نفسه، بس لو جاب visits/appointments مضمّنة).

#### `GET /patients`
- **Query:** `search?`, `gender? (MALE|FEMALE|OTHER)`, `includeDeleted? (true|false)`, `page? (default 1)`, `limit? (default 10, max 100)`
- **Response:** Paginated list من `PatientSummary` objects.

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
  "mrn": "string (اختياري — لو ماتبعتوش, بيتولّد تلقائي بصيغة MRN-000001)",
  "fullName": "string (2-100 حرف)",
  "phone": "string (7-20 رقم، فورمات زي +20... أو أرقام عادية)",
  "dateOfBirth": "YYYY-MM-DD (لازم تكون في الماضي وبعد 1900-01-01)",
  "gender": "MALE | FEMALE | OTHER",
  "address": "string (اختياري، max 255)",
  "notes": "string (اختياري، max 1000)"
}
```
- **201 Created**, `data`: PatientSummary.
- **409 Conflict** لو الـ phone أو MRN مكرر في نفس العيادة (unique constraint: `clinicId+phone`, `clinicId+mrn`).

#### `GET /patients/:id`
- بيرجع `PatientDetail` فيه كمان `visits[]` و`appointments[]` مختصرين. لو اليوزر `DOCTOR`، الزيارات والمواعيد المرجعة بتتفلتر على دكتوره بس.

#### `PATCH /patients/:id`
- Body: أي حقل من `fullName, phone, dateOfBirth, gender, address (nullable), notes (nullable)` — لازم حقل واحد على الأقل.

#### `DELETE /patients/:id`
- **Soft delete** — بيحط `deletedAt` بس، مابيمسحش الـ row. `data: null`.

#### `PATCH /patients/:id/restore`
- بيرجّع المريض اللي اتعمله soft delete (`deletedAt: null`).

---

### 3.3 Appointments — `/appointments` 🔒 (DOCTOR, RECEPTIONIST)

#### `GET /appointments`
- **Query:** `search?`, `status? (SCHEDULED|CONFIRMED|COMPLETED|CANCELLED|NO_SHOW)`, `patientId?`, `doctorId?`, `date? (YYYY-MM-DD)`, `fromDate?`, `toDate?`, `page?`, `limit? (max 100)`.
- لو اليوزر `DOCTOR`، الـ `doctorId` بيتفرض على مواعيده هو حتى لو بعت `doctorId` تاني (403 لو اختلف).

#### `POST /appointments`
```json
{
  "patientId": "uuid",
  "doctorId": "uuid",
  "appointmentDate": "YYYY-MM-DD (مينفعش يكون تاريخ فات)",
  "appointmentTime": "HH:MM (24 ساعة)",
  "notes": "string (اختياري, max 1000)"
}
```
- **201 Created**. لو الدكتور عنده موعد تاني `SCHEDULED` أو `CONFIRMED` في نفس اليوم ونفس الوقت → `409 Conflict` (في constraint في الداتابيز نفسها).

#### `GET /appointments/:id`
- `AppointmentDetail` — فيها الـ `visit` المرتبطة (لو موجودة) بكل تفاصيلها.

#### `PATCH /appointments/:id`
- أي حقل من: `doctorId?, appointmentDate?, appointmentTime?, notes? (nullable)`.

#### أكشنز تغيير الحالة (كل واحدة `PATCH`, بدون body):
| Endpoint | من حالة | لحالة |
|---|---|---|
| `/appointments/:id/confirm` | SCHEDULED | CONFIRMED |
| `/appointments/:id/cancel` | SCHEDULED أو CONFIRMED | CANCELLED |
| `/appointments/:id/complete` | CONFIRMED | COMPLETED |
| `/appointments/:id/no-show` | SCHEDULED أو CONFIRMED | NO_SHOW |

> أي محاولة تغيير حالة مش مسموحة (زي إكمال موعد لسه SCHEDULED) بترجع error — الـ transitions المسموحة متعرّفة في الكود (`ALLOWED_STATUS_TRANSITIONS`).

---

### 3.4 Queue — `/queue` 🔒 (DOCTOR, RECEPTIONIST)

> كل دكتور عنده طابوره الخاص بيه، مفيش طابور واحد مشترك. الأرقام (`queueNumber`) unique لكل `(doctorId, queueDate)`.

**QueueStatus:** `WAITING → IN_PROGRESS → SERVED` أو `→ CANCELLED` في أي وقت (من WAITING أو IN_PROGRESS).

#### `GET /queue`
- **Query:** `status?`, `doctorId?`, `date? (default اليوم)`, `page?`, `limit? (default 20, max 100)`.

#### `GET /queue/status`
- لو فيه `doctorId` محدد (أو اليوزر دكتور) → بيرجع object واحد:
```json
{
  "currentlyServing": { /* QueueEntrySummary */ } | null,
  "nextWaiting": { /* QueueEntrySummary */ } | null,
  "waitingCount": 3,
  "servedCount": 7
}
```
- لو الريسپشن ماحددتش `doctorId` → بيرجع **array** فيه نفس الشكل فوق + `doctor: { id, fullName, specialty }` لكل دكاترة العيادة.

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
- بيضيف مريض للطابور مباشرة (checked-in فعلًا).
```json
{
  "patientId": "uuid",
  "doctorId": "uuid (اختياري، إجباري لو أنت ريسپشن ومفيش appointmentId)",
  "appointmentId": "uuid (اختياري)",
  "chiefComplaint": "string (max 500, اختياري)",
  "notes": "string (max 1000, اختياري)"
}
```
- **201 Created** → `QueueEntrySummary` (وبيعمل `Visit` جديدة ورا الكواليس مرتبطة بالـ entry، عشان كده في `visitId`).

#### `POST /queue/reserve`
- بيحجز رقم من أول 3 أرقام بس (عشان حالات زي "محجوز لحد جاي بعدين")، من غير ما يكون فيه مريض فعلي لسه.
```json
{
  "doctorId": "uuid (اختياري)",
  "reservedFor": "string (1-100 حرف — اسم أو وصف)",
  "queueNumber": 1 | 2 | 3,
  "notes": "string (اختياري)"
}
```
- **201 Created**, `isReserved: true`.

#### `POST /queue/:id/check-in` (تشييك إن المريض صاحب الحجز وصل)
```json
{
  "patientId": "uuid",
  "chiefComplaint": "string (اختياري)",
  "notes": "string (اختياري)"
}
```
- بيحوّل الـ reserved slot لـ entry حقيقي.

#### `GET /queue/:id`
- `QueueEntrySummary` واحدة.

#### `POST /queue/call-next`
- **Body:** `{ "doctorId": "uuid (اختياري لو ريسپشن)" }`
- بينادي أول واحد `WAITING` (بالترتيب، مع مراعاة اللي اتعمله `skip`)، يحطه `IN_PROGRESS`، ولو فيه حد `IN_PROGRESS` قبل كده يتحط `SERVED` تلقائيًا (الانتقال التلقائي من اللي قبله).

#### `PATCH /queue/:id/start` — بدء الكشف فعليًا (`startedAt`)
#### `PATCH /queue/:id/serve` — إنهاء الكشف (`status: SERVED`, `servedAt`)
#### `PATCH /queue/:id/skip` — تخطي المريض (`skippedAt` — بيروح آخر الصف لحد ما يتنادى تاني)
#### `PATCH /queue/:id/recall` — استدعاء مريض اتخطى قبل كده
```json
{ "notes": "string (اختياري)" }
```
#### `PATCH /queue/:id/cancel` — إلغاء entry (من WAITING أو IN_PROGRESS)
#### `POST /queue/reset`
- **Body:** `{ "doctorId": "uuid (اختياري)" }`
- بيلغي (`CANCELLED`) كل الـ entries اللي لسه `WAITING` أو `IN_PROGRESS` ليوم معين.
- **Response:**
```json
{ "success": true, "message": "Queue reset successfully. 3 entries cancelled.", "data": { "cancelled": 3 } }
```

---

### 3.5 Visits — `/visits` 🔒

> القراءة متاحة لـ `DOCTOR` و`RECEPTIONIST` (مع redaction للريسپشن). **الكتابة (create/update/delete) مقصورة على `DOCTOR` بس.**

#### `GET /visits`
- **Query:** `search?`, `patientId?`, `doctorId?`, `createdById?`, `date?`, `fromDate?`, `toDate?`, `sortBy? (visitDate|createdAt, default visitDate)`, `sortOrder? (asc|desc, default desc)`, `page?`, `limit?`.

#### `GET /visits/:id`
#### `GET /patients/:patientId/visits` (route منفصل تحت patients، بس بيستخدم نفس الـ controller)

#### `POST /visits` 🔒 DOCTOR only
```json
{
  "patientId": "uuid",
  "appointmentId": "uuid (اختياري)",
  "queueEntryId": "uuid (اختياري)",
  "visitDate": "YYYY-MM-DD (اختياري، افتراضيًا اليوم)",
  "chiefComplaint": "string (max 500, اختياري)",
  "diagnosis": "string (max 1000, اختياري)",
  "treatment": "string (max 1000, اختياري)",
  "prescription": "string (max 1000, اختياري)",
  "notes": "string (max 1000, اختياري)"
}
```
> فيه unique constraint: مريض واحد مايقدرش يكون عنده أكتر من visit لنفس الدكتور في نفس اليوم (`patientId+visitDate+doctorId`).

#### `PATCH /visits/:id` 🔒 DOCTOR only
- أي حقل من: `chiefComplaint, diagnosis, treatment, prescription, notes` (كلهم nullable), و`followUpDate` (لازم يكون تاريخ **مستقبلي**).

#### `DELETE /visits/:id` 🔒 DOCTOR only

---

### 3.6 Dashboard — `/dashboard` 🔒 (DOCTOR, RECEPTIONIST + redaction)

كل الـ endpoints هنا GET بس، ومفيهاش body:

| Endpoint | الوصف |
|---|---|
| `GET /dashboard/overview?doctorId=&date=` | أرقام عامة: مرضى، مواعيد، زيارات، طابور (كلها counts) |
| `GET /dashboard/today?doctorId=&date=` | تفاصيل يوم معيّن: مواعيد اليوم + زيارات اليوم + حالة الطابور |
| `GET /dashboard/queue?doctorId=&date=&page=&limit=` | شاشة متابعة الطابور (اللي بيخدم حاليًا، التالي، قائمة الانتظار + إحصائيات) |
| `GET /dashboard/appointments?doctorId=&fromDate=&toDate=&page=&limit=` | مواعيد قادمة / مكتملة / ملغاة مقسّمة |
| `GET /dashboard/patients?doctorId=&page=&limit=` | أحدث مرضى مسجلين + أحدث زيارات + توزيع النوع |
| `GET /dashboard/analytics?doctorId=&fromDate=&toDate=` | إحصائيات لفترة: زيارات/مواعيد يوميًا، تسجيل مرضى شهريًا، معدلات إكمال/إلغاء |

> كل الـ query params دي اختيارية. لو اليوزر `DOCTOR`، الـ `doctorId` بيتفرض على نفسه تلقائيًا بغض النظر عما تم إرساله.

شكل `AnalyticsDashboard` (أكبر response):
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
- أي دكتور يقدر يقرأها. بترجع:
```json
{
  "id", "clinicId",
  "workingHours": { "monday": { "open": "09:00", "close": "17:00", "isOpen": true }, "...": "...لكل أيام الأسبوع" },
  "maxPatientsPerDay": 50,
  "appointmentDuration": 30,
  "gracePeriod": 15,
  "delayThreshold": 20,
  "waitingScreenMode": "NUMBERS" | "NAMES",
  "clinic": { "id", "name", "phone", "email", "address", "isActive", "createdAt", "updatedAt" }
}
```

#### `PATCH /clinic-settings` 🔒 **Clinic Admin only** (`isClinicAdmin: true`)
- أي حقل من: `name?, phone? (nullable), email? (nullable), address? (nullable), workingHours?, maxPatientsPerDay? (1-1000), appointmentDuration? (5-480 دقيقة), gracePeriod? (1-120), delayThreshold? (1-240), waitingScreenMode? (NUMBERS|NAMES)`.
- `waitingScreenMode`: بيتحكم في شاشة الانتظار العامة — `NUMBERS` تعرض الأرقام بس، `NAMES` تعرض أرقام + أسماء مموّهة (زي "أحمد م.").

---

### 3.8 Users (موظفين العيادة) — `/users` 🔒 **Clinic Admin only**

#### `POST /users/receptionist`
```json
{ "email": "string", "password": "string (8+ مع تعقيد)", "fullName": "string (2-100)" }
```
- بيعمل حساب `RECEPTIONIST` جديد في نفس عيادة الـ admin. **201 Created**.

#### `GET /users`
- بيرجع كل حسابات العيادة (دكاترة + ريسپشن).

#### `PATCH /users/:id/status`
```json
{ "isActive": true | false }
```
- تفعيل/تعطيل حساب. التعطيل بيلغي كل جلساته فورًا.

#### `PATCH /users/:id/admin`
```json
{ "isClinicAdmin": true | false }
```
- منح/سحب صلاحية "clinic admin" — بس للحسابات اللي role بتاعها `DOCTOR`.

---

### 3.9 Doctors — `/doctors` 🔒

#### `GET /doctors` (DOCTOR, RECEPTIONIST)
- بيرجع كل دكاترة العيادة.

#### `PATCH /doctors/:id` 🔒 DOCTOR only
- دكتور يقدر يعدّل **بروفايله هو بس** (403 لو حاول يعدّل دكتور تاني).
```json
{
  "specialty?": "string (2-100)",
  "bio?": "string|null (max 1000)",
  "appointmentDuration?": "number|null (5-240 دقيقة)",
  "workingHours?": "object|null (نفس شكل الكلينك سيتنجز)",
  "isBookable?": "boolean"
}
```
> **ملاحظة:** مفيش `POST /doctors` — إنشاء دكتور جديد بيتم بس من الـ Platform Admin API (`/admin/clinics/:id/doctors`)، مش من هنا.

---

### 3.10 Public API — `/public` (بدون Authentication — خاص بموقع الحجز العام وشاشة الانتظار)

هنا الـ routes كلها محتاجة `:clinicId` في الـ URL، وملهاش علاقة بالـ login خالص (مفيش Authorization header).

#### `GET /public/clinics/:clinicId/waiting-screen?doctorId=`
- ده الـ endpoint اللي بتعمله شاشة التلفزيون في قاعة الانتظار polling عليه كل ثانية تقريبًا.
- **Rate limit:** 60 طلب/دقيقة/IP.
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
> `patientName` بيبقى `null` في وضع `NUMBERS`، وبيبقى اسم متقطّع (زي "أحمد م.") في وضع `NAMES`.

#### `GET /public/clinics/:clinicId/doctors`
- قائمة الدكاترة القابلين للحجز الإلكتروني بس (`isBookable: true`).

#### `GET /public/clinics/:clinicId/availability?doctorId=&date=YYYY-MM-DD`
- المواعيد المتاحة ليوم معيّن لدكتور معيّن.

#### `POST /public/clinics/:clinicId/patients/lookup`
- **Rate limit:** 20 طلب/15 دقيقة/IP
```json
{ "phone": "string" }
```
- بيدور على مريض موجود بالفعل برقم التليفون (عشان مايتسجلش مرتين).

#### `POST /public/clinics/:clinicId/patients/register`
```json
{
  "fullName": "string (2-100)",
  "phone": "string",
  "dateOfBirth": "YYYY-MM-DD",
  "gender": "MALE | FEMALE | OTHER"
}
```
- **201 Created** — تسجيل مريض جديد ذاتيًا من غير احتياج لحساب staff.

#### `POST /public/clinics/:clinicId/appointments`
```json
{
  "patientId": "uuid",
  "doctorId": "uuid",
  "appointmentDate": "YYYY-MM-DD",
  "appointmentTime": "HH:MM",
  "notes": "string (اختياري)"
}
```
- **201 Created** — حجز موعد ذاتي من الموقع العام.

---

## 4. Platform Admin API — `/admin/*`

> نظام مستقل تمامًا — له جدول خاص (`PlatformAdmin`) مش `User`، وtoken بسecret مختلف (`ADMIN_JWT_SECRET`)، ومفيهوش refresh token (الأدمن بيعمل login تاني لما التوكن ينتهي، افتراضيًا بعد `8h`). **ده مش جزء من واجهة العيادة العادية — ده لوحة تحكم صاحب المنصة اللي بيضيف عيادات جديدة.**

الهيدر المطلوب لكل الـ admin routes (ما عدا login):
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
#### `POST /admin/auth/logout` 🔒 — بيلغي كل جلسات الأدمن (مفيش توكن واحد بيتلغي لوحده هنا)
#### `PATCH /admin/auth/change-password` 🔒
```json
{ "currentPassword": "string", "newPassword": "string (max 72 حرف)", "confirmPassword": "string" }
```

### 4.2 `/admin/clinics` 🔒

#### `GET /admin/clinics?search=&status=active|inactive|all&page=&limit=`

#### `POST /admin/clinics`
- بينشئ **عيادة جديدة + أول دكتور فيها + إعداداتها** في request واحد. **الباسورد بيتولّد عشوائيًا من السيرفر ويترجع مرة واحدة بس** (الـ response فيه `Cache-Control: no-store`).
```json
{
  "clinic": { "name": "string (2-100)", "phone?": "string", "email?": "string", "address?": "string" },
  "doctor": { "fullName": "string", "email": "string", "specialty": "string", "bio?": "string" },
  "settings?": { "workingHours?": "...", "maxPatientsPerDay?": 50, "appointmentDuration?": 30, "gracePeriod?": 15, "delayThreshold?": 20 }
}
```
- **201 Created** — الرد بيتضمن الباسورد المؤقت للدكتور (مرة واحدة بس، لازم الفرونت يعرضها فورًا ويقول للمستخدم يحفظها).

#### `GET /admin/clinics/:id`
#### `PATCH /admin/clinics/:id` — تعديل بيانات العيادة (name/phone/email/address)
#### `PATCH /admin/clinics/:id/status` — `{ "isActive": true|false }` (تعليق/تفعيل عيادة كاملة)
#### `POST /admin/clinics/:id/doctors` — إضافة دكتور جديد لعيادة موجودة (نفس فكرة الباسورد المؤقت المرة الواحدة)
#### `POST /admin/clinics/:id/users/:userId/reset-password` — إعادة تعيين باسورد موظف (باسورد عشوائي جديد، يترجع مرة واحدة)

> **كل الـ write endpoints هنا تحت rate limit: 30 طلب/15 دقيقة/IP** (`adminWriteLimiter`).

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

## 5. Enums (من `prisma/schema.prisma`)

```ts
Role              = "DOCTOR" | "RECEPTIONIST"
Gender            = "MALE" | "FEMALE" | "OTHER"
AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"
QueueStatus       = "WAITING" | "IN_PROGRESS" | "SERVED" | "CANCELLED"
WaitingScreenMode = "NUMBERS" | "NAMES"
```

---

## 6. ملاحظات مهمة للفرونت (حاجات لو مش منتبهلها هتضرب)

1. **كل الـ dates اللي بتبعتها للـ API** (appointmentDate, dateOfBirth, visitDate, followUpDate...) لازم تكون string بصيغة `YYYY-MM-DD` فقط (مش ISO كامل بالـ time). الوقت بيتبعت منفصل (`appointmentTime: "HH:MM"`).
2. **التايم زون بتاع العيادة** هو `Africa/Cairo` افتراضيًا (`CLINIC_TIMEZONE`) — فيه validation بيقارن التاريخ المبعوت بـ "اليوم" على التايم زون ده (`getClinicTodayStr`)، يعني لو السيرفر شغال بتايم زون مختلف المقارنة لسه بتتم على توقيت القاهرة.
3. **Pagination params** غالبًا `page` (default 1) و`limit` (default يختلف حسب الـ endpoint، max دايمًا 100).
4. **كل حقول الـ phone** لازم تتوافق مع `^\+?[0-9\s\-().]+$` وطول 7-20.
5. **الباسورد الجديد** (في `change-password`, `createReceptionist`, إلخ) لازم يحقق: 8 حروف فأكثر + حرف كبير + حرف صغير + رقم + رمز خاص.
6. **المسارات المحمية بالدور (role)**: الفرونت لازم يعرف دور اليوزر من `GET /auth/me` ويخفي الأزرار/الصفحات اللي الدور ده مايقدرش يوصلها (زي إعدادات العيادة لو مش clinic admin، أو شاشة التشخيص لو ريسپشن) — لكن ده مجرد UX، **السيرفر بيرفض الطلب فعليًا برضو** حتى لو الفرونت سمح بالخطأ.
7. **لما تيجي تعمل refresh للتوكن**، خزّن الـ refreshToken الجديد فورًا لأن القديم بيبقى متلغي من نفس اللحظة.
8. **Rate limiting:** لو رجع `429`، الرسالة في `message` جاهزة للعرض، وفيه standard headers (`RateLimit-*`) ممكن تتقرى لو عايز تعمل countdown.
9. **شاشة الانتظار العامة والموقع العام (`/public/*`)** مفيهمش Authorization خالص — دول لازم يتبنوا كصفحات منفصلة تمامًا عن الداشبورد.
10. **الـ Receptionist مش هيشوف أبدًا** `diagnosis` / `treatment` / `prescription` في أي response — متعملش fallback زي `data.diagnosis || "—"` في كود مشترك بين الدورين، لأن الحقل مش موجود أصلًا مش `null`.

---

## 7. متغيرات البيئة اللي الباك إند محتاجها (من `.env.example`) — للمعرفة بس، مش للفرونت

```
JWT_SECRET=...
JWT_EXPIRES_IN=15m          (افتراضي)
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRES_IN=30d  (افتراضي)
ADMIN_JWT_SECRET=...        (لازم يختلف عن الاتنين فوق)
ADMIN_JWT_EXPIRES_IN=8h     (افتراضي)
DATABASE_URL=postgresql://...
PORT=5000                   (افتراضي)
CORS_ORIGIN=http://localhost:3000   (دومينات الفرونت المسموحة، comma-separated)
CLINIC_TIMEZONE=Africa/Cairo
```

> **CORS:** السيرفر بيقبل بس الدومينات المكتوبة في `CORS_ORIGIN` (مفصولة بفاصلة)، مع `credentials: true`. لازم تتأكد إن دومين الفرونت بتاعك مضاف هناك وإلا هيترفض الطلب من المتصفح.

---

*الملف ده اتبنى بقراءة الكود الفعلي في [mazenfarht/clinic-backend](https://github.com/mazenfarht/clinic-backend) على فرع `main` بتاريخ 19 نوفمبر 2026. أي تحديث على الكود بعد كده محتاج مراجعة الملف ده تاني.*
