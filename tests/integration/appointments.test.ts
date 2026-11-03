import request from "supertest";
import app from "../helpers/app";
import {
  createClinic,
  createUser,
  createPatient,
  createAppointment,
  deleteClinicCascade,
  signAccessToken,
  authHeader,
  futureDateStr,
  TestClinic,
  TestUser,
} from "../helpers/factories";

describe("Appointments module", () => {
  let clinic: TestClinic;
  let doctor: TestUser;
  let doctorToken: string;
  let patient: any;

  beforeAll(async () => {
    clinic = await createClinic();
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "appt-doctor@example.com",
    });
    doctorToken = signAccessToken(doctor as any);
    patient = await createPatient(clinic.id, doctor.id);
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  describe("POST /api/v1/appointments", () => {
    it("rejects without authentication", async () => {
      const res = await request(app)
        .post("/api/v1/appointments")
        .send({
          patientId: patient.id,
          appointmentDate: futureDateStr(2),
          appointmentTime: "10:00",
        });
      expect(res.status).toBe(401);
    });

    it("returns 404 for a non-existent patient", async () => {
      const res = await request(app)
        .post("/api/v1/appointments")
        .set(authHeader(doctorToken))
        .send({
          patientId: "11111111-1111-1111-1111-111111111111",
          appointmentDate: futureDateStr(2),
          appointmentTime: "10:00",
        });
      expect(res.status).toBe(404);
    });

    it("creates a scheduled appointment", async () => {
      const res = await request(app)
        .post("/api/v1/appointments")
        .set(authHeader(doctorToken))
        .send({
          patientId: patient.id,
          appointmentDate: futureDateStr(3),
          appointmentTime: "10:00",
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("SCHEDULED");
    });

    it("returns 409 for a conflicting date/time", async () => {
      const res = await request(app)
        .post("/api/v1/appointments")
        .set(authHeader(doctorToken))
        .send({
          patientId: patient.id,
          appointmentDate: futureDateStr(3),
          appointmentTime: "10:00",
        });
      expect(res.status).toBe(409);
    });

    it("rejects a past appointment date with 400", async () => {
      const res = await request(app)
        .post("/api/v1/appointments")
        .set(authHeader(doctorToken))
        .send({
          patientId: patient.id,
          appointmentDate: "2000-01-01",
          appointmentTime: "10:00",
        });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/appointments and /:id", () => {
    it("lists appointments with pagination", async () => {
      const res = await request(app)
        .get("/api/v1/appointments")
        .set(authHeader(doctorToken))
        .query({ page: 1, limit: 5 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("returns 404 for a non-existent appointment id", async () => {
      const res = await request(app)
        .get("/api/v1/appointments/11111111-1111-1111-1111-111111111111")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(404);
    });

    it("returns appointment detail by id", async () => {
      const appt = await createAppointment(clinic.id, patient.id, doctor.id, {
        appointmentDate: futureDateStr(5),
        appointmentTime: "11:00",
      });
      const res = await request(app)
        .get(`/api/v1/appointments/${appt.id}`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(appt.id);
    });
  });

  describe("PATCH /api/v1/appointments/:id", () => {
    it("updates notes without changing the time slot", async () => {
      const appt = await createAppointment(clinic.id, patient.id, doctor.id, {
        appointmentDate: futureDateStr(6),
        appointmentTime: "12:00",
      });
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}`)
        .set(authHeader(doctorToken))
        .send({ notes: "Updated notes" });
      expect(res.status).toBe(200);
      expect(res.body.data.notes).toBe("Updated notes");
    });

    it("returns 400 when updating a completed appointment", async () => {
      const appt = await createAppointment(clinic.id, patient.id, doctor.id, {
        appointmentDate: futureDateStr(7),
        appointmentTime: "13:00",
        status: "COMPLETED",
      });
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}`)
        .set(authHeader(doctorToken))
        .send({ notes: "Should fail" });
      expect(res.status).toBe(400);
    });
  });

  describe("Status transition endpoints", () => {
    it("confirms a SCHEDULED appointment", async () => {
      const appt = await createAppointment(clinic.id, patient.id, doctor.id, {
        appointmentDate: futureDateStr(8),
        appointmentTime: "09:00",
      });
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/confirm`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("CONFIRMED");
    });

    it("rejects completing a SCHEDULED (unconfirmed) appointment", async () => {
      const appt = await createAppointment(clinic.id, patient.id, doctor.id, {
        appointmentDate: futureDateStr(9),
        appointmentTime: "09:00",
      });
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/complete`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(400);
    });

    it("completes a CONFIRMED appointment", async () => {
      const appt = await createAppointment(clinic.id, patient.id, doctor.id, {
        appointmentDate: futureDateStr(10),
        appointmentTime: "09:00",
        status: "CONFIRMED",
      });
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/complete`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("COMPLETED");
    });

    it("cancels a SCHEDULED appointment", async () => {
      const appt = await createAppointment(clinic.id, patient.id, doctor.id, {
        appointmentDate: futureDateStr(11),
        appointmentTime: "09:00",
      });
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/cancel`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("CANCELLED");
    });

    it("rejects cancelling an already cancelled appointment", async () => {
      const appt = await createAppointment(clinic.id, patient.id, doctor.id, {
        appointmentDate: futureDateStr(12),
        appointmentTime: "09:00",
        status: "CANCELLED",
      });
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/cancel`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(400);
    });

    it("marks a SCHEDULED appointment as no-show", async () => {
      const appt = await createAppointment(clinic.id, patient.id, doctor.id, {
        appointmentDate: futureDateStr(13),
        appointmentTime: "09:00",
      });
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/no-show`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("NO_SHOW");
    });

    it("returns 404 for transitions on a non-existent appointment", async () => {
      const res = await request(app)
        .patch(
          "/api/v1/appointments/11111111-1111-1111-1111-111111111111/confirm"
        )
        .set(authHeader(doctorToken));
      expect(res.status).toBe(404);
    });
  });
});
