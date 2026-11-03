import request from "supertest";
import app from "../helpers/app";
import {
  createClinic,
  createUser,
  createPatient,
  createClinicSettings,
  deleteClinicCascade,
  futureDateStr,
  TestClinic,
  TestUser,
} from "../helpers/factories";

describe("Public module (no authentication required)", () => {
  let clinic: TestClinic;
  let inactiveClinic: TestClinic;
  let doctor: TestUser;

  beforeAll(async () => {
    clinic = await createClinic();
    await createClinicSettings(clinic.id);
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "public-doctor@example.com",
    });

    inactiveClinic = await createClinic({ isActive: false });
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
    await deleteClinicCascade(inactiveClinic.id);
  });

  describe("GET /api/v1/public/clinics/:clinicId/availability", () => {
    it("returns 400 for a malformed clinicId", async () => {
      const res = await request(app).get(
        "/api/v1/public/clinics/not-a-uuid/availability"
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for an inactive/non-existent clinic", async () => {
      const res = await request(app)
        .get(`/api/v1/public/clinics/${inactiveClinic.id}/availability`)
        .query({ date: futureDateStr(1) });
      expect(res.status).toBe(404);
    });

    it("rejects a malformed date query", async () => {
      const res = await request(app)
        .get(`/api/v1/public/clinics/${clinic.id}/availability`)
        .query({ date: "not-a-date" });
      expect(res.status).toBe(400);
    });

    it("rejects a past date", async () => {
      const res = await request(app)
        .get(`/api/v1/public/clinics/${clinic.id}/availability`)
        .query({ date: "2000-01-01" });
      expect(res.status).toBe(400);
    });

    it("returns available slots for a valid future date", async () => {
      const res = await request(app)
        .get(`/api/v1/public/clinics/${clinic.id}/availability`)
        .query({ date: futureDateStr(2) });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("isOpen");
      expect(res.body.data).toHaveProperty("availableSlots");
    });
  });

  describe("POST /api/v1/public/clinics/:clinicId/patients/lookup", () => {
    it("rejects an invalid phone format", async () => {
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/patients/lookup`)
        .send({ phone: "x" });
      expect(res.status).toBe(400);
    });

    it("returns exists:false for an unknown phone", async () => {
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/patients/lookup`)
        .send({ phone: "+19990000000" });
      expect(res.status).toBe(200);
      expect(res.body.data.exists).toBe(false);
    });

    it("returns exists:true for a registered patient", async () => {
      const patient = await createPatient(clinic.id, doctor.id, {
        phone: "+19990001111",
      });
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/patients/lookup`)
        .send({ phone: patient.phone });
      expect(res.status).toBe(200);
      expect(res.body.data.exists).toBe(true);
      expect(res.body.data.patientId).toBe(patient.id);
    });
  });

  describe("POST /api/v1/public/clinics/:clinicId/patients/register", () => {
    const validPayload = {
      fullName: "Walk In Patient",
      phone: "+19995551111",
      dateOfBirth: "1995-06-15",
      gender: "OTHER",
    };

    it("rejects an invalid payload", async () => {
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/patients/register`)
        .send({ ...validPayload, gender: "INVALID" });
      expect(res.status).toBe(400);
    });

    it("registers a new patient with an auto-generated MRN", async () => {
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/patients/register`)
        .send(validPayload);
      expect(res.status).toBe(201);
      expect(res.body.data.patientId).toBeTruthy();
      expect(res.body.data.fullName).toBe(validPayload.fullName);
    });

    it("returns 409 for a duplicate phone in the same clinic", async () => {
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/patients/register`)
        .send(validPayload);
      expect(res.status).toBe(409);
    });
  });

  describe("POST /api/v1/public/clinics/:clinicId/appointments", () => {
    it("rejects a past appointment date", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/appointments`)
        .send({
          patientId: patient.id,
          appointmentDate: "2000-01-01",
          appointmentTime: "09:00",
        });
      expect(res.status).toBe(400);
    });

    it("returns 404 for a non-existent patient", async () => {
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/appointments`)
        .send({
          patientId: "11111111-1111-1111-1111-111111111111",
          appointmentDate: futureDateStr(3),
          appointmentTime: "09:00",
        });
      expect(res.status).toBe(404);
    });

    it("rejects a time slot outside working hours", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/appointments`)
        .send({
          patientId: patient.id,
          appointmentDate: futureDateStr(4),
          appointmentTime: "23:30",
        });
      expect(res.status).toBe(400);
    });

    it("books a valid appointment within working hours", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/appointments`)
        .send({
          patientId: patient.id,
          appointmentDate: futureDateStr(5),
          appointmentTime: "10:00",
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("SCHEDULED");
      expect(res.body.data.appointmentTime).toBe("10:00");
    });

    it("returns 409 when the same patient double-books the same date", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/appointments`)
        .send({
          patientId: patient.id,
          appointmentDate: futureDateStr(6),
          appointmentTime: "10:00",
        });

      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/appointments`)
        .send({
          patientId: patient.id,
          appointmentDate: futureDateStr(6),
          appointmentTime: "11:00",
        });
      expect(res.status).toBe(409);
    });

    it("returns 409 when another patient takes the same slot", async () => {
      const patientA = await createPatient(clinic.id, doctor.id);
      const patientB = await createPatient(clinic.id, doctor.id);

      await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/appointments`)
        .send({
          patientId: patientA.id,
          appointmentDate: futureDateStr(7),
          appointmentTime: "10:30",
        });

      const res = await request(app)
        .post(`/api/v1/public/clinics/${clinic.id}/appointments`)
        .send({
          patientId: patientB.id,
          appointmentDate: futureDateStr(7),
          appointmentTime: "10:30",
        });
      expect(res.status).toBe(409);
    });
  });
});
