import request from "supertest";
import app from "../helpers/app";
import prisma from "../helpers/prisma";
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

describe("Queue module", () => {
  let clinic: TestClinic;
  let doctor: TestUser;
  let doctorToken: string;

  beforeAll(async () => {
    clinic = await createClinic();
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "queue-doctor@example.com",
    });
    doctorToken = signAccessToken(doctor as any);
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  describe("POST /api/v1/queue/check-in", () => {
    it("rejects without authentication", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .post("/api/v1/queue/check-in")
        .send({ patientId: patient.id });
      expect(res.status).toBe(401);
    });

    it("returns 404 for a non-existent patient", async () => {
      const res = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: "11111111-1111-1111-1111-111111111111" });
      expect(res.status).toBe(404);
    });

    it("checks in a patient and creates a WAITING entry", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id, chiefComplaint: "Fever" });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("WAITING");
      expect(res.body.data.checkedInAt).toBeTruthy();
    });

    it("returns 409 when the patient already has an active queue entry today", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id });

      const res = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id });
      expect(res.status).toBe(409);
    });
  });

  describe("POST /api/v1/queue/reserve", () => {
    it("reserves a slot between 1 and 3", async () => {
      const res = await request(app)
        .post("/api/v1/queue/reserve")
        .set(authHeader(doctorToken))
        .send({ reservedFor: "VIP Guest", queueNumber: 1 });
      expect(res.status).toBe(201);
      expect(res.body.data.isReserved).toBe(true);
      expect(res.body.data.checkedInAt).toBeNull();
    });

    it("rejects queueNumber outside 1-3 at the validation layer", async () => {
      const res = await request(app)
        .post("/api/v1/queue/reserve")
        .set(authHeader(doctorToken))
        .send({ reservedFor: "Out Of Range", queueNumber: 5 });
      expect(res.status).toBe(400);
    });

    it("returns 409 for an already-taken queue number on the same day", async () => {
      const res = await request(app)
        .post("/api/v1/queue/reserve")
        .set(authHeader(doctorToken))
        .send({ reservedFor: "Duplicate Slot", queueNumber: 1 });
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/v1/queue, /status, /statistics", () => {
    it("lists today's queue with pagination", async () => {
      const res = await request(app)
        .get("/api/v1/queue")
        .set(authHeader(doctorToken))
        .query({ page: 1, limit: 10 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("returns current queue status shape", async () => {
      const res = await request(app)
        .get("/api/v1/queue/status")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("currentlyServing");
      expect(res.body.data).toHaveProperty("nextWaiting");
      expect(res.body.data).toHaveProperty("waitingCount");
      expect(res.body.data).toHaveProperty("servedCount");
    });

    it("returns queue statistics shape", async () => {
      const res = await request(app)
        .get("/api/v1/queue/statistics")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("total");
      expect(res.body.data).toHaveProperty("waiting");
      expect(res.body.data).toHaveProperty("averageWaitTimeMinutes");
    });

    it("rejects a malformed statistics date", async () => {
      const res = await request(app)
        .get("/api/v1/queue/statistics")
        .set(authHeader(doctorToken))
        .query({ date: "01-01-2026" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/queue/:id", () => {
    it("returns 404 for a non-existent entry", async () => {
      const res = await request(app)
        .get("/api/v1/queue/11111111-1111-1111-1111-111111111111")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(404);
    });
  });

  describe("Queue entry lifecycle: call-next / start / serve / skip / recall / cancel", () => {
    it("rejects start-consultation on a WAITING (not yet called) entry", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const checkInRes = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id });
      const entryId = checkInRes.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/queue/${entryId}/start`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(400);
    });

    it("rejects marking a WAITING entry as served directly", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const checkInRes = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id });
      const entryId = checkInRes.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/queue/${entryId}/serve`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(400);
    });

    it("returns 404 from call-next when there are no waiting patients", async () => {
      await prisma.queueEntry.updateMany({
        where: {
          clinicId: clinic.id,
          status: { in: ["WAITING", "IN_PROGRESS"] },
        },
        data: { status: "CANCELLED" },
      });

      const res = await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(404);
    });

    it("calls the next patient, starts, and serves the consultation", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const checkInRes = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id });
      const entryId = checkInRes.body.data.id;

      const callNextRes = await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      expect(callNextRes.status).toBe(200);
      expect(callNextRes.body.data.status).toBe("IN_PROGRESS");

      const startRes = await request(app)
        .patch(`/api/v1/queue/${entryId}/start`)
        .set(authHeader(doctorToken));
      expect(startRes.status).toBe(200);
      expect(startRes.body.data.startedAt).toBeTruthy();

      const serveRes = await request(app)
        .patch(`/api/v1/queue/${entryId}/serve`)
        .set(authHeader(doctorToken));
      expect(serveRes.status).toBe(200);
      expect(serveRes.body.data.status).toBe("SERVED");
    });

    it("returns 409 from call-next while another entry is IN_PROGRESS", async () => {
      const p1 = await createPatient(clinic.id, doctor.id);
      const p2 = await createPatient(clinic.id, doctor.id);

      await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: p1.id });
      await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: p2.id });

      const first = await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      expect(first.status).toBe(200);

      const second = await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      expect(second.status).toBe(409);
    });

    it("skips an IN_PROGRESS entry back to WAITING", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const checkInRes = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id });
      const entryId = checkInRes.body.data.id;

      await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));

      const skipRes = await request(app)
        .patch(`/api/v1/queue/${entryId}/skip`)
        .set(authHeader(doctorToken));
      expect(skipRes.status).toBe(200);
      expect(skipRes.body.data.status).toBe("WAITING");
    });

    it("rejects recalling an entry that is not WAITING", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const checkInRes = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id });
      const entryId = checkInRes.body.data.id;

      const cancelRes = await request(app)
        .patch(`/api/v1/queue/${entryId}/cancel`)
        .set(authHeader(doctorToken));
      expect(cancelRes.status).toBe(200);

      const recallRes = await request(app)
        .patch(`/api/v1/queue/${entryId}/recall`)
        .set(authHeader(doctorToken));
      expect(recallRes.status).toBe(400);
    });

    it("rejects cancelling an already-SERVED entry", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const checkInRes = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id });
      const entryId = checkInRes.body.data.id;

      await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      await request(app)
        .patch(`/api/v1/queue/${entryId}/serve`)
        .set(authHeader(doctorToken));

      const cancelRes = await request(app)
        .patch(`/api/v1/queue/${entryId}/cancel`)
        .set(authHeader(doctorToken));
      expect(cancelRes.status).toBe(400);
    });
  });

  describe("POST /api/v1/queue/reset", () => {
    it("cancels all WAITING/IN_PROGRESS entries for today", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId: patient.id });

      const res = await request(app)
        .post("/api/v1/queue/reset")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(typeof res.body.data.cancelled).toBe("number");

      const remaining = await prisma.queueEntry.count({
        where: {
          clinicId: clinic.id,
          status: { in: ["WAITING", "IN_PROGRESS"] },
        },
      });
      expect(remaining).toBe(0);
    });
  });
});
