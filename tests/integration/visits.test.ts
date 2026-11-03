import request from "supertest";
import app from "../helpers/app";
import {
  createClinic,
  createUser,
  createPatient,
  createAppointment,
  createVisit,
  deleteClinicCascade,
  signAccessToken,
  authHeader,
  todayDateOnly,
  TestClinic,
  TestUser,
} from "../helpers/factories";

describe("Visits module", () => {
  let clinic: TestClinic;
  let doctor: TestUser;
  let receptionist: TestUser;
  let doctorToken: string;
  let receptionistToken: string;
  let patient: any;

  beforeAll(async () => {
    clinic = await createClinic();
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "visit-doctor@example.com",
    });
    receptionist = await createUser(clinic.id, "RECEPTIONIST", {
      email: "visit-receptionist@example.com",
    });
    doctorToken = signAccessToken(doctor as any);
    receptionistToken = signAccessToken(receptionist as any);
    patient = await createPatient(clinic.id, doctor.id);
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  describe("POST /api/v1/visits", () => {
    it("rejects without authentication", async () => {
      const res = await request(app)
        .post("/api/v1/visits")
        .send({ patientId: patient.id });
      expect(res.status).toBe(401);
    });

    it("rejects a RECEPTIONIST (DOCTOR-only mutation)", async () => {
      const res = await request(app)
        .post("/api/v1/visits")
        .set(authHeader(receptionistToken))
        .send({ patientId: patient.id });
      expect(res.status).toBe(403);
    });

    it("returns 404 for a non-existent patient", async () => {
      const res = await request(app)
        .post("/api/v1/visits")
        .set(authHeader(doctorToken))
        .send({ patientId: "11111111-1111-1111-1111-111111111111" });
      expect(res.status).toBe(404);
    });

    it("creates a visit as DOCTOR", async () => {
      const freshPatient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .post("/api/v1/visits")
        .set(authHeader(doctorToken))
        .send({ patientId: freshPatient.id, chiefComplaint: "Cough" });
      expect(res.status).toBe(201);
      expect(res.body.data.patientId).toBe(freshPatient.id);
    });

    it("returns 409 for a second visit for the same patient on the same date", async () => {
      const freshPatient = await createPatient(clinic.id, doctor.id);
      await request(app)
        .post("/api/v1/visits")
        .set(authHeader(doctorToken))
        .send({ patientId: freshPatient.id });

      const res = await request(app)
        .post("/api/v1/visits")
        .set(authHeader(doctorToken))
        .send({ patientId: freshPatient.id });
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/v1/visits and /:id", () => {
    it("allows RECEPTIONIST to list visits (read-only access)", async () => {
      const res = await request(app)
        .get("/api/v1/visits")
        .set(authHeader(receptionistToken))
        .query({ page: 1, limit: 10 });
      expect(res.status).toBe(200);
    });

    it("returns 404 for a non-existent visit id", async () => {
      const res = await request(app)
        .get("/api/v1/visits/11111111-1111-1111-1111-111111111111")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(404);
    });

    it("returns visit detail including appointment/queueEntry fields", async () => {
      const freshPatient = await createPatient(clinic.id, doctor.id);
      const visit = await createVisit(clinic.id, freshPatient.id, doctor.id);
      const res = await request(app)
        .get(`/api/v1/visits/${visit.id}`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(visit.id);
      expect(res.body.data).toHaveProperty("appointment");
      expect(res.body.data).toHaveProperty("queueEntry");
    });
  });

  describe("GET /api/v1/patients/:patientId/visits", () => {
    it("returns 404 for a non-existent patient", async () => {
      const res = await request(app)
        .get("/api/v1/patients/11111111-1111-1111-1111-111111111111/visits")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(404);
    });

    it("returns visits scoped to the given patient", async () => {
      const freshPatient = await createPatient(clinic.id, doctor.id);
      await createVisit(clinic.id, freshPatient.id, doctor.id);

      const res = await request(app)
        .get(`/api/v1/patients/${freshPatient.id}/visits`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(
        res.body.data.every((v: any) => v.patientId === freshPatient.id)
      ).toBe(true);
    });
  });

  describe("PATCH /api/v1/visits/:id", () => {
    it("rejects a RECEPTIONIST", async () => {
      const freshPatient = await createPatient(clinic.id, doctor.id);
      const visit = await createVisit(clinic.id, freshPatient.id, doctor.id);

      const res = await request(app)
        .patch(`/api/v1/visits/${visit.id}`)
        .set(authHeader(receptionistToken))
        .send({ diagnosis: "Flu" });
      expect(res.status).toBe(403);
    });

    it("rejects an empty update body", async () => {
      const freshPatient = await createPatient(clinic.id, doctor.id);
      const visit = await createVisit(clinic.id, freshPatient.id, doctor.id);

      const res = await request(app)
        .patch(`/api/v1/visits/${visit.id}`)
        .set(authHeader(doctorToken))
        .send({});
      expect(res.status).toBe(400);
    });

    it("updates diagnosis/treatment as DOCTOR", async () => {
      const freshPatient = await createPatient(clinic.id, doctor.id);
      const visit = await createVisit(clinic.id, freshPatient.id, doctor.id);

      const res = await request(app)
        .patch(`/api/v1/visits/${visit.id}`)
        .set(authHeader(doctorToken))
        .send({ diagnosis: "Flu", treatment: "Rest and fluids" });
      expect(res.status).toBe(200);
      expect(res.body.data.diagnosis).toBe("Flu");
    });
  });

  describe("DELETE /api/v1/visits/:id", () => {
    it("rejects a RECEPTIONIST", async () => {
      const freshPatient = await createPatient(clinic.id, doctor.id);
      const visit = await createVisit(clinic.id, freshPatient.id, doctor.id);

      const res = await request(app)
        .delete(`/api/v1/visits/${visit.id}`)
        .set(authHeader(receptionistToken));
      expect(res.status).toBe(403);
    });

    it("deletes a visit as DOCTOR", async () => {
      const freshPatient = await createPatient(clinic.id, doctor.id);
      const visit = await createVisit(clinic.id, freshPatient.id, doctor.id);

      const res = await request(app)
        .delete(`/api/v1/visits/${visit.id}`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/v1/visits/${visit.id}`)
        .set(authHeader(doctorToken));
      expect(getRes.status).toBe(404);
    });
  });
});
