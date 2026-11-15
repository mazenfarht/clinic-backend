import request from "supertest";
import { randomUUID } from "crypto";
import app from "../helpers/app";
import prisma from "../helpers/prisma";
import {
  createClinic,
  createUser,
  createPatient,
  deleteClinicCascade,
  createPlatformAdmin,
  deletePlatformAdmin,
  signAccessToken,
  signAdminToken,
  authHeader,
  DEFAULT_PASSWORD,
  TestPlatformAdmin,
} from "../helpers/factories";

const BASE = "/api/v1/admin/clinics";
const unique = () => randomUUID().slice(0, 8);

describe("Admin clinics module", () => {
  let admin: TestPlatformAdmin;
  let adminToken: string;
  const clinicIds: string[] = [];

  beforeAll(async () => {
    admin = await createPlatformAdmin();
    adminToken = signAdminToken(admin.id);
  });

  afterAll(async () => {
    for (const id of clinicIds) await deleteClinicCascade(id);
    await deletePlatformAdmin(admin.id);
  });

  const asAdmin = () => ({ ...authHeader(adminToken) });

  // Creates a clinic through the API and remembers it for cleanup.
  async function createViaApi(
    overrides: { clinic?: object; doctor?: object; settings?: object } = {}
  ) {
    const u = unique();
    const body = {
      clinic: { name: `Test Clinic ${u}`, ...(overrides.clinic ?? {}) },
      doctor: {
        fullName: "Dr. Test",
        email: `doctor-${u}@example.com`,
        specialty: "General Medicine",
        ...(overrides.doctor ?? {}),
      },
      ...(overrides.settings ? { settings: overrides.settings } : {}),
    };
    const res = await request(app).post(BASE).set(asAdmin()).send(body);
    if (res.status === 201) clinicIds.push(res.body.data.clinic.id);
    return { res, body };
  }

  const clinicLogin = (email: string, password: string) =>
    request(app).post("/api/v1/auth/login").send({ email, password });

  // -------------------------------------------------------------------------
  describe("authentication", () => {
    const routes: Array<[string, string]> = [
      ["get", BASE],
      ["post", BASE],
      ["get", `${BASE}/${randomUUID()}`],
      ["patch", `${BASE}/${randomUUID()}`],
      ["patch", `${BASE}/${randomUUID()}/status`],
      ["post", `${BASE}/${randomUUID()}/doctors`],
      ["post", `${BASE}/${randomUUID()}/users/${randomUUID()}/reset-password`],
      ["get", "/api/v1/admin/stats"],
    ];

    it.each(routes)("%s %s requires an admin token", async (method, url) => {
      const res = await (request(app) as any)[method](url);
      expect(res.status).toBe(401);
    });

    it("rejects a clinic user's token on every admin route", async () => {
      const clinic = await createClinic();
      clinicIds.push(clinic.id);
      const doctor = await createUser(clinic.id, "DOCTOR");
      const token = signAccessToken(doctor);

      for (const [method, url] of routes) {
        const res = await (request(app) as any)
          [method](url)
          .set(authHeader(token));
        expect(res.status).toBe(401);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("POST /admin/clinics", () => {
    it("creates clinic + settings + doctor and returns the password once", async () => {
      const { res, body } = await createViaApi({
        clinic: { phone: "+201001234567", address: "Giza" },
        doctor: { email: `MiXeD-${unique()}@Example.com`, bio: "Cardiologist" },
      });

      expect(res.status).toBe(201);
      expect(res.headers["cache-control"]).toMatch(/no-store/);

      const { clinic, doctor, credentials } = res.body.data;
      expect(clinic.name).toBe(body.clinic.name);
      expect(clinic.isActive).toBe(true);
      expect(doctor.specialty).toBe("General Medicine");
      expect(doctor.user.fullName).toBe("Dr. Test");

      // email stored lowercase, password generated and strong
      expect(credentials.email).toBe(body.doctor.email.toLowerCase());
      expect(credentials.temporaryPassword).toEqual(expect.any(String));
      expect(credentials.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      expect(credentials.temporaryPassword).toMatch(/[A-Z]/);
      expect(credentials.temporaryPassword).toMatch(/[a-z]/);
      expect(credentials.temporaryPassword).toMatch(/[0-9]/);
      expect(credentials.temporaryPassword).toMatch(/[^A-Za-z0-9]/);

      // everything really exists and is linked
      const row = await prisma.clinic.findUnique({
        where: { id: clinic.id },
        include: { settings: true, users: true, doctors: true },
      });
      expect(row?.settings).not.toBeNull();
      expect(row?.users).toHaveLength(1);
      expect(row?.users[0].role).toBe("DOCTOR");
      expect(row?.doctors).toHaveLength(1);
      expect(row?.doctors[0].userId).toBe(row?.users[0].id);

      // only a hash is stored, never the password
      expect(row?.users[0].passwordHash).not.toBe(credentials.temporaryPassword);
      expect(row?.users[0].passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it("gives the clinic the Egyptian default week (Fri closed, Sat open)", async () => {
      const { res } = await createViaApi();
      const settings = await prisma.clinicSettings.findUnique({
        where: { clinicId: res.body.data.clinic.id },
      });
      const wh = settings?.workingHours as Record<string, { isOpen: boolean }>;
      expect(wh.friday.isOpen).toBe(false);
      expect(wh.saturday.isOpen).toBe(true);
      expect(wh.sunday.isOpen).toBe(true);
      expect(settings?.appointmentDuration).toBe(30);
    });

    it("applies custom settings when provided", async () => {
      const { res } = await createViaApi({
        settings: { appointmentDuration: 20, maxPatientsPerDay: 40, gracePeriod: 10 },
      });
      const settings = await prisma.clinicSettings.findUnique({
        where: { clinicId: res.body.data.clinic.id },
      });
      expect(settings?.appointmentDuration).toBe(20);
      expect(settings?.maxPatientsPerDay).toBe(40);
      expect(settings?.gracePeriod).toBe(10);
      expect(settings?.delayThreshold).toBe(20); // untouched default
    });

    it("the generated credentials really log the doctor in, scoped to that clinic", async () => {
      const { res } = await createViaApi();
      const { clinic, credentials } = res.body.data;

      const login = await clinicLogin(
        credentials.email,
        credentials.temporaryPassword
      );
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe("DOCTOR");
      expect(login.body.data.user.clinicId).toBe(clinic.id);

      // and it can use the clinic API with that token
      const me = await request(app)
        .get("/api/v1/auth/me")
        .set(authHeader(login.body.data.tokens.accessToken));
      expect(me.status).toBe(200);
    });

    it("gives every clinic a different password", async () => {
      const a = await createViaApi();
      const b = await createViaApi();
      expect(a.res.body.data.credentials.temporaryPassword).not.toBe(
        b.res.body.data.credentials.temporaryPassword
      );
    });

    it("is all-or-nothing: a failure part-way leaves nothing behind", async () => {
      const name = `Atomic ${unique()}`;
      const real = prisma.$transaction.bind(prisma);

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementationOnce(((fn: (tx: unknown) => unknown) =>
          real(async (tx: any) =>
            fn(
              new Proxy(tx, {
                get(target, prop) {
                  if (prop === "doctor") {
                    return {
                      create: async () => {
                        throw new Error("simulated failure after clinic + user");
                      },
                    };
                  }
                  return target[prop];
                },
              })
            )
          )) as any);

      const res = await request(app)
        .post(BASE)
        .set(asAdmin())
        .send({
          clinic: { name },
          doctor: {
            fullName: "Dr. Atomic",
            email: `atomic-${unique()}@example.com`,
            specialty: "General Medicine",
          },
        });

      expect(res.status).toBe(500);
      expect(await prisma.clinic.count({ where: { name } })).toBe(0);
      expect(
        await prisma.user.count({ where: { fullName: "Dr. Atomic" } })
      ).toBe(0);
    });

    it("rejects a duplicate clinic name, case-insensitively (409)", async () => {
      const name = `Dup ${unique()}`;
      expect((await createViaApi({ clinic: { name } })).res.status).toBe(201);
      const again = await createViaApi({ clinic: { name: name.toUpperCase() } });
      expect(again.res.status).toBe(409);
    });

    it("rejects invalid bodies (400)", async () => {
      const send = (b: object) => request(app).post(BASE).set(asAdmin()).send(b);
      expect((await send({})).status).toBe(400);
      expect((await send({ clinic: { name: "Only Clinic" } })).status).toBe(400);
      expect(
        (
          await send({
            clinic: { name: "Bad Email Clinic" },
            doctor: { fullName: "Dr X", email: "nope", specialty: "GP" },
          })
        ).status
      ).toBe(400);
    });

    it("ignores a password supplied by the caller", async () => {
      const u = unique();
      const res = await request(app)
        .post(BASE)
        .set(asAdmin())
        .send({
          clinic: { name: `Pw Clinic ${u}` },
          doctor: {
            fullName: "Dr. Pw",
            email: `pw-${u}@example.com`,
            specialty: "GP",
            password: "Chosen!Passw0rd1",
          },
        });
      expect(res.status).toBe(201);
      clinicIds.push(res.body.data.clinic.id);
      expect(res.body.data.credentials.temporaryPassword).not.toBe(
        "Chosen!Passw0rd1"
      );
      expect(
        (await clinicLogin(`pw-${u}@example.com`, "Chosen!Passw0rd1")).status
      ).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  describe("GET /admin/clinics and /admin/clinics/:id", () => {
    let clinicId: string;
    let doctorEmail: string;
    let clinicName: string;

    beforeAll(async () => {
      const { res } = await createViaApi({ clinic: { name: `Listed ${unique()}` } });
      clinicId = res.body.data.clinic.id;
      clinicName = res.body.data.clinic.name;
      doctorEmail = res.body.data.credentials.email;

      // give it some clinical data + a receptionist, to prove only COUNTS leak
      const doctorUser = await prisma.user.findFirstOrThrow({
        where: { clinicId, role: "DOCTOR" },
      });
      await createPatient(clinicId, doctorUser.id, {
        fullName: "SECRET PATIENT NAME",
        phone: "+201999888777",
      });
      await createPatient(clinicId, doctorUser.id, { deletedAt: new Date() });
      await createUser(clinicId, "RECEPTIONIST", { email: `rec-${unique()}@example.com` });
    });

    it("lists clinics with pagination meta", async () => {
      const res = await request(app).get(`${BASE}?limit=2&page=1`).set(asAdmin());
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 2 });
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it("finds a clinic by name and by a staff email", async () => {
      const byName = await request(app)
        .get(`${BASE}?search=${encodeURIComponent(clinicName.toLowerCase())}`)
        .set(asAdmin());
      expect(byName.body.data.map((c: { id: string }) => c.id)).toContain(clinicId);

      const byEmail = await request(app)
        .get(`${BASE}?search=${encodeURIComponent(doctorEmail)}`)
        .set(asAdmin());
      expect(byEmail.body.data.map((c: { id: string }) => c.id)).toContain(clinicId);
    });

    it("reports counts (soft-deleted patients excluded) and no clinical data", async () => {
      const res = await request(app)
        .get(`${BASE}?search=${encodeURIComponent(clinicName)}`)
        .set(asAdmin());
      const row = res.body.data.find((c: { id: string }) => c.id === clinicId);

      expect(row.counts).toEqual({
        doctors: 1,
        receptionists: 1,
        patients: 1,
        appointments: 0,
        visits: 0,
      });
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/SECRET PATIENT NAME|201999888777|passwordHash/);
    });

    it("filters by status", async () => {
      await request(app).patch(`${BASE}/${clinicId}/status`).set(asAdmin()).send({ isActive: false });
      const inactive = await request(app).get(`${BASE}?status=inactive&limit=100`).set(asAdmin());
      expect(inactive.body.data.map((c: { id: string }) => c.id)).toContain(clinicId);
      const active = await request(app).get(`${BASE}?status=active&limit=100`).set(asAdmin());
      expect(active.body.data.map((c: { id: string }) => c.id)).not.toContain(clinicId);
      await request(app).patch(`${BASE}/${clinicId}/status`).set(asAdmin()).send({ isActive: true });
    });

    it("returns details: settings, doctors, receptionists, counts", async () => {
      const res = await request(app).get(`${BASE}/${clinicId}`).set(asAdmin());
      expect(res.status).toBe(200);
      const c = res.body.data;
      expect(c.settings.appointmentDuration).toBe(30);
      expect(c.doctors).toHaveLength(1);
      expect(c.doctors[0].user.email).toBe(doctorEmail);
      expect(c.receptionists).toHaveLength(1);
      expect(c.counts.patients).toBe(1);

      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/SECRET PATIENT NAME|201999888777|passwordHash|tokenVersion/);
    });

    it("404 for an unknown clinic, 400 for a malformed id", async () => {
      expect((await request(app).get(`${BASE}/${randomUUID()}`).set(asAdmin())).status).toBe(404);
      expect((await request(app).get(`${BASE}/not-a-uuid`).set(asAdmin())).status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  describe("PATCH /admin/clinics/:id", () => {
    it("updates fields, and null clears optional ones", async () => {
      const { res } = await createViaApi({ clinic: { phone: "+201001112223" } });
      const id = res.body.data.clinic.id;

      const upd = await request(app)
        .patch(`${BASE}/${id}`)
        .set(asAdmin())
        .send({ name: `Renamed ${unique()}`, phone: null, address: "Cairo" });
      expect(upd.status).toBe(200);
      expect(upd.body.data.phone).toBeNull();
      expect(upd.body.data.address).toBe("Cairo");
      expect(upd.body.data.name).toMatch(/^Renamed /);
    });

    it("keeping its own name is fine; taking another clinic's name is 409", async () => {
      const a = await createViaApi();
      const b = await createViaApi();
      const aId = a.res.body.data.clinic.id;

      const same = await request(app)
        .patch(`${BASE}/${aId}`)
        .set(asAdmin())
        .send({ name: a.res.body.data.clinic.name });
      expect(same.status).toBe(200);

      const clash = await request(app)
        .patch(`${BASE}/${aId}`)
        .set(asAdmin())
        .send({ name: b.res.body.data.clinic.name });
      expect(clash.status).toBe(409);
    });

    it("400 for an empty body, 404 for an unknown clinic", async () => {
      const { res } = await createViaApi();
      const id = res.body.data.clinic.id;
      expect((await request(app).patch(`${BASE}/${id}`).set(asAdmin()).send({})).status).toBe(400);
      expect(
        (await request(app).patch(`${BASE}/${randomUUID()}`).set(asAdmin()).send({ name: "Whatever" })).status
      ).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  describe("PATCH /admin/clinics/:id/status", () => {
    it("suspending locks the clinic out immediately; reactivating restores access", async () => {
      const { res } = await createViaApi();
      const { clinic, credentials } = res.body.data;

      const login = await clinicLogin(credentials.email, credentials.temporaryPassword);
      expect(login.status).toBe(200);
      const { accessToken, refreshToken } = login.body.data.tokens;
      expect(
        (await request(app).get("/api/v1/auth/me").set(authHeader(accessToken))).status
      ).toBe(200);

      const off = await request(app)
        .patch(`${BASE}/${clinic.id}/status`)
        .set(asAdmin())
        .send({ isActive: false });
      expect(off.status).toBe(200);
      expect(off.body.data.isActive).toBe(false);

      // existing token dies at once, new logins and refresh are refused,
      // and the public booking page closes
      expect(
        (await request(app).get("/api/v1/auth/me").set(authHeader(accessToken))).status
      ).toBe(401);
      expect((await clinicLogin(credentials.email, credentials.temporaryPassword)).status).toBe(401);
      expect(
        (await request(app).post("/api/v1/auth/refresh").send({ refreshToken })).status
      ).toBe(401);
      expect(
        (await request(app).get(`/api/v1/public/clinics/${clinic.id}/doctors`)).status
      ).toBe(404);

      // nothing was deleted
      expect(await prisma.user.count({ where: { clinicId: clinic.id } })).toBe(1);

      const on = await request(app)
        .patch(`${BASE}/${clinic.id}/status`)
        .set(asAdmin())
        .send({ isActive: true });
      expect(on.status).toBe(200);
      expect((await clinicLogin(credentials.email, credentials.temporaryPassword)).status).toBe(200);
    });

    it("400 without a boolean, 404 for an unknown clinic", async () => {
      const { res } = await createViaApi();
      const id = res.body.data.clinic.id;
      expect((await request(app).patch(`${BASE}/${id}/status`).set(asAdmin()).send({})).status).toBe(400);
      expect(
        (await request(app).patch(`${BASE}/${randomUUID()}/status`).set(asAdmin()).send({ isActive: false })).status
      ).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  describe("POST /admin/clinics/:id/doctors", () => {
    it("adds a second doctor with a generated password who can log in", async () => {
      const { res } = await createViaApi();
      const clinicId = res.body.data.clinic.id;
      const email = `second-${unique()}@example.com`;

      const add = await request(app)
        .post(`${BASE}/${clinicId}/doctors`)
        .set(asAdmin())
        .send({ fullName: "Dr. Second", email: email.toUpperCase(), specialty: "Pediatrics", appointmentDuration: 15 });

      expect(add.status).toBe(201);
      expect(add.headers["cache-control"]).toMatch(/no-store/);
      expect(add.body.data.doctor.specialty).toBe("Pediatrics");
      expect(add.body.data.doctor.appointmentDuration).toBe(15);
      expect(add.body.data.credentials.email).toBe(email);

      const login = await clinicLogin(email, add.body.data.credentials.temporaryPassword);
      expect(login.status).toBe(200);
      expect(login.body.data.user.clinicId).toBe(clinicId);
      expect(await prisma.doctor.count({ where: { clinicId } })).toBe(2);
    });

    it("409 for a duplicate email in the same clinic, 404 for an unknown clinic, 400 for a bad body", async () => {
      const { res } = await createViaApi();
      const clinicId = res.body.data.clinic.id;
      const existing = res.body.data.credentials.email;

      const dup = await request(app)
        .post(`${BASE}/${clinicId}/doctors`)
        .set(asAdmin())
        .send({ fullName: "Dr. Dup", email: existing, specialty: "GP" });
      expect(dup.status).toBe(409);

      const nf = await request(app)
        .post(`${BASE}/${randomUUID()}/doctors`)
        .set(asAdmin())
        .send({ fullName: "Dr. Ghost", email: `g-${unique()}@example.com`, specialty: "GP" });
      expect(nf.status).toBe(404);

      const bad = await request(app)
        .post(`${BASE}/${clinicId}/doctors`)
        .set(asAdmin())
        .send({ fullName: "Dr. Bad" });
      expect(bad.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  describe("POST /admin/clinics/:id/users/:userId/reset-password", () => {
    it("resets a doctor's password and ends all their sessions", async () => {
      const { res } = await createViaApi();
      const { clinic, credentials } = res.body.data;
      const user = await prisma.user.findFirstOrThrow({ where: { clinicId: clinic.id } });

      const login = await clinicLogin(credentials.email, credentials.temporaryPassword);
      const { accessToken, refreshToken } = login.body.data.tokens;

      const reset = await request(app)
        .post(`${BASE}/${clinic.id}/users/${user.id}/reset-password`)
        .set(asAdmin());
      expect(reset.status).toBe(200);
      expect(reset.headers["cache-control"]).toMatch(/no-store/);
      const fresh = reset.body.data.credentials;
      expect(fresh.email).toBe(credentials.email);
      expect(fresh.temporaryPassword).not.toBe(credentials.temporaryPassword);

      // old password, old access token and old refresh token are all dead
      expect((await clinicLogin(credentials.email, credentials.temporaryPassword)).status).toBe(401);
      expect((await request(app).get("/api/v1/auth/me").set(authHeader(accessToken))).status).toBe(401);
      expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken })).status).toBe(401);
      // the new password works
      expect((await clinicLogin(fresh.email, fresh.temporaryPassword)).status).toBe(200);
    });

    it("also works for a receptionist", async () => {
      const { res } = await createViaApi();
      const clinicId = res.body.data.clinic.id;
      const rec = await createUser(clinicId, "RECEPTIONIST", {
        email: `rec-${unique()}@example.com`,
        password: DEFAULT_PASSWORD,
      });

      const reset = await request(app)
        .post(`${BASE}/${clinicId}/users/${rec.id}/reset-password`)
        .set(asAdmin());
      expect(reset.status).toBe(200);
      expect(reset.body.data.user.role).toBe("RECEPTIONIST");
      expect((await clinicLogin(rec.email, DEFAULT_PASSWORD)).status).toBe(401);
      expect((await clinicLogin(rec.email, reset.body.data.credentials.temporaryPassword)).status).toBe(200);
    });

    it("cannot reset a user of ANOTHER clinic (404)", async () => {
      const a = await createViaApi();
      const b = await createViaApi();
      const userOfB = await prisma.user.findFirstOrThrow({
        where: { clinicId: b.res.body.data.clinic.id },
      });

      const res = await request(app)
        .post(`${BASE}/${a.res.body.data.clinic.id}/users/${userOfB.id}/reset-password`)
        .set(asAdmin());
      expect(res.status).toBe(404);

      // and B's user is untouched
      expect(
        (await clinicLogin(b.res.body.data.credentials.email, b.res.body.data.credentials.temporaryPassword)).status
      ).toBe(200);
    });

    it("404 for an unknown user", async () => {
      const { res } = await createViaApi();
      const out = await request(app)
        .post(`${BASE}/${res.body.data.clinic.id}/users/${randomUUID()}/reset-password`)
        .set(asAdmin());
      expect(out.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  describe("GET /admin/stats", () => {
    it("returns platform counts that follow clinic creation", async () => {
      const before = await request(app).get("/api/v1/admin/stats").set(asAdmin());
      expect(before.status).toBe(200);
      expect(before.body.data.clinics.total).toBe(
        before.body.data.clinics.active + before.body.data.clinics.inactive
      );

      await createViaApi();
      const after = await request(app).get("/api/v1/admin/stats").set(asAdmin());

      expect(after.body.data.clinics.total).toBe(before.body.data.clinics.total + 1);
      expect(after.body.data.clinics.active).toBe(before.body.data.clinics.active + 1);
      expect(after.body.data.doctors).toBe(before.body.data.doctors + 1);
      expect(after.body.data.thisMonth).toEqual({
        appointments: expect.any(Number),
        visits: expect.any(Number),
      });
      expect(new Date(after.body.data.generatedAt).getTime()).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  describe("clinic-side POST /doctors is gone", () => {
    it("a clinic doctor can no longer create doctors", async () => {
      const clinic = await createClinic();
      clinicIds.push(clinic.id);
      const doctor = await createUser(clinic.id, "DOCTOR");

      const res = await request(app)
        .post("/api/v1/doctors")
        .set(authHeader(signAccessToken(doctor)))
        .send({
          email: `x-${unique()}@example.com`,
          password: "Str0ng!Passw0rd",
          fullName: "Dr. Intruder",
          specialty: "GP",
        });
      expect(res.status).toBe(404);
      expect(await prisma.doctor.count({ where: { clinicId: clinic.id } })).toBe(1);
    });

    it("listing doctors still works for clinic staff", async () => {
      const clinic = await createClinic();
      clinicIds.push(clinic.id);
      const doctor = await createUser(clinic.id, "DOCTOR");
      const res = await request(app)
        .get("/api/v1/doctors")
        .set(authHeader(signAccessToken(doctor)));
      expect(res.status).toBe(200);
    });
  });
});
