import request from "supertest";
import app from "../helpers/app";
import {
  createClinic,
  createUser,
  deleteClinicCascade,
  signAccessToken,
  authHeader,
  TestClinic,
  TestUser,
} from "../helpers/factories";

describe("Clinic settings module", () => {
  let clinic: TestClinic;
  let doctor: TestUser;
  let receptionist: TestUser;
  let doctorToken: string;
  let receptionistToken: string;

  beforeAll(async () => {
    clinic = await createClinic();
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "settings-doctor@example.com",
    });
    receptionist = await createUser(clinic.id, "RECEPTIONIST", {
      email: "settings-receptionist@example.com",
    });
    doctorToken = signAccessToken(doctor as any);
    receptionistToken = signAccessToken(receptionist as any);
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  describe("GET /api/v1/clinic-settings", () => {
    it("rejects without authentication", async () => {
      const res = await request(app).get("/api/v1/clinic-settings");
      expect(res.status).toBe(401);
    });

    it("rejects a RECEPTIONIST (DOCTOR-only)", async () => {
      const res = await request(app)
        .get("/api/v1/clinic-settings")
        .set(authHeader(receptionistToken));
      expect(res.status).toBe(403);
    });

    it("returns default settings for a DOCTOR, auto-creating them if absent", async () => {
      const res = await request(app)
        .get("/api/v1/clinic-settings")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data.clinicId).toBe(clinic.id);
      expect(res.body.data.maxPatientsPerDay).toBe(50);
      expect(res.body.data.clinic.id).toBe(clinic.id);
    });
  });

  describe("PATCH /api/v1/clinic-settings", () => {
    it("rejects an empty payload", async () => {
      const res = await request(app)
        .patch("/api/v1/clinic-settings")
        .set(authHeader(doctorToken))
        .send({});
      expect(res.status).toBe(400);
    });

    it("rejects a RECEPTIONIST", async () => {
      const res = await request(app)
        .patch("/api/v1/clinic-settings")
        .set(authHeader(receptionistToken))
        .send({ maxPatientsPerDay: 75 });
      expect(res.status).toBe(403);
    });

    it("updates a scalar settings field", async () => {
      const res = await request(app)
        .patch("/api/v1/clinic-settings")
        .set(authHeader(doctorToken))
        .send({ maxPatientsPerDay: 75 });
      expect(res.status).toBe(200);
      expect(res.body.data.maxPatientsPerDay).toBe(75);
    });

    it("updates clinic contact fields", async () => {
      const res = await request(app)
        .patch("/api/v1/clinic-settings")
        .set(authHeader(doctorToken))
        .send({ name: "Renamed Clinic", phone: "+19998887766" });
      expect(res.status).toBe(200);
      expect(res.body.data.clinic.name).toBe("Renamed Clinic");
    });

    it("rejects an incomplete workingHours object", async () => {
      const res = await request(app)
        .patch("/api/v1/clinic-settings")
        .set(authHeader(doctorToken))
        .send({
          workingHours: {
            monday: { open: "09:00", close: "17:00", isOpen: true },
          },
        });
      expect(res.status).toBe(400);
    });
  });
});
