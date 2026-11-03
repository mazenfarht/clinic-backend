import request from "supertest";
import app from "../helpers/app";
import {
  createClinic,
  createUser,
  createPatient,
  deleteClinicCascade,
  signAccessToken,
  authHeader,
  TestClinic,
  TestUser,
} from "../helpers/factories";

describe("Dashboard module", () => {
  let clinic: TestClinic;
  let doctor: TestUser;
  let doctorToken: string;

  beforeAll(async () => {
    clinic = await createClinic();
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "dash-doctor@example.com",
    });
    doctorToken = signAccessToken(doctor as any);
    await createPatient(clinic.id, doctor.id);
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  const endpoints: Array<{ path: string; keys: string[] }> = [
    {
      path: "/api/v1/dashboard/overview",
      keys: ["totalPatients", "totalAppointments"],
    },
    {
      path: "/api/v1/dashboard/today",
      keys: ["date", "appointments", "visits", "queue"],
    },
    { path: "/api/v1/dashboard/queue", keys: ["date", "statistics"] },
    { path: "/api/v1/dashboard/appointments", keys: ["upcoming", "summary"] },
    {
      path: "/api/v1/dashboard/patients",
      keys: ["totalActive", "genderBreakdown"],
    },
    { path: "/api/v1/dashboard/analytics", keys: ["period", "visitsPerDay"] },
  ];

  it.each(endpoints)(
    "rejects $path without authentication",
    async ({ path }) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  );

  it.each(endpoints)(
    "returns 200 with expected shape for $path",
    async ({ path, keys }) => {
      const res = await request(app).get(path).set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      keys.forEach((key) => expect(res.body.data).toHaveProperty(key));
    }
  );

  it("rejects a malformed date on /dashboard/overview", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/overview")
      .set(authHeader(doctorToken))
      .query({ date: "bad-date" });
    expect(res.status).toBe(400);
  });

  it("rejects analytics fromDate after toDate", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/analytics")
      .set(authHeader(doctorToken))
      .query({ fromDate: "2026-02-01", toDate: "2026-01-01" });
    expect(res.status).toBe(400);
  });
});
