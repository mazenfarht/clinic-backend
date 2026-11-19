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

  // All tests share one doctor and "today's" queue, so entries left behind by
  // one test (a patient still IN_PROGRESS, a taken queue number) would change
  // the outcome of the next one. Suites that depend on a clean queue call this.
  async function clearQueue() {
    await prisma.queueEntry.deleteMany({ where: { clinicId: clinic.id } });
  }

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
        .send({ patientId: "11111111-1111-4111-8111-111111111111" });
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
    // Check-ins above already took queue number 1 for today.
    beforeAll(clearQueue);

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
        .get("/api/v1/queue/11111111-1111-4111-8111-111111111111")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(404);
    });
  });

  describe("Queue entry lifecycle: call-next / start / serve / skip / recall / cancel", () => {
    beforeEach(clearQueue);

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

    // Checks a walk-in in and returns the queue entry.
    async function checkInWalkIn(patientId: string) {
      const res = await request(app)
        .post("/api/v1/queue/check-in")
        .set(authHeader(doctorToken))
        .send({ patientId });
      expect(res.status).toBe(201);
      return res.body.data;
    }

    // Calls the next patient and serves them; returns the patient id called.
    async function callAndServe(): Promise<string> {
      const called = await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      expect(called.status).toBe(200);
      const served = await request(app)
        .patch(`/api/v1/queue/${called.body.data.id}/serve`)
        .set(authHeader(doctorToken));
      expect(served.status).toBe(200);
      return called.body.data.visit.patient.id;
    }

    it("a skipped patient returns after 3 other patients: A,B,C,D,E -> B,C,D,A,E", async () => {
      const [a, b, c, d, e] = await Promise.all(
        [0, 1, 2, 3, 4].map(() => createPatient(clinic.id, doctor.id))
      );
      const entryA = await checkInWalkIn(a.id);
      for (const p of [b, c, d, e]) await checkInWalkIn(p.id);

      // A is called first, does not show up, and is skipped
      const first = await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      expect(first.body.data.id).toBe(entryA.id);

      const skip = await request(app)
        .patch(`/api/v1/queue/${entryA.id}/skip`)
        .set(authHeader(doctorToken));
      expect(skip.status).toBe(200);
      expect(skip.body.data.status).toBe("WAITING");
      expect(skip.body.data.skippedAt).toBeTruthy();
      expect(skip.body.data.calledAt).toBeNull();

      const order: string[] = [];
      for (let i = 0; i < 5; i++) order.push(await callAndServe());

      expect(order).toEqual([b.id, c.id, d.id, a.id, e.id]);
    });

    it("skipping the same patient twice holds them again for 3 patients", async () => {
      const patients = await Promise.all(
        [0, 1, 2, 3, 4, 5, 6, 7].map(() => createPatient(clinic.id, doctor.id))
      );
      const [a, b, c, d, e, f, g, h] = patients;
      const entryA = await checkInWalkIn(a.id);
      for (const p of [b, c, d, e, f, g, h]) await checkInWalkIn(p.id);

      const skipA = async () => {
        const called = await request(app)
          .post("/api/v1/queue/call-next")
          .set(authHeader(doctorToken));
        expect(called.body.data.id).toBe(entryA.id);
        const skip = await request(app)
          .patch(`/api/v1/queue/${entryA.id}/skip`)
          .set(authHeader(doctorToken));
        expect(skip.status).toBe(200);
      };

      await skipA();
      const firstRound: string[] = [];
      for (let i = 0; i < 3; i++) firstRound.push(await callAndServe());
      expect(firstRound).toEqual([b.id, c.id, d.id]);

      // A is back after 3 patients; call and skip once more
      await skipA();
      const secondRound: string[] = [];
      for (let i = 0; i < 5; i++) secondRound.push(await callAndServe());
      expect(secondRound).toEqual([e.id, f.id, g.id, a.id, h.id]);
    });

    it("a skipped patient with nobody else waiting is called again at once", async () => {
      const p = await createPatient(clinic.id, doctor.id);
      const entry = await checkInWalkIn(p.id);

      await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      await request(app)
        .patch(`/api/v1/queue/${entry.id}/skip`)
        .set(authHeader(doctorToken));

      const again = await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      expect(again.status).toBe(200);
      expect(again.body.data.id).toBe(entry.id);
      expect(again.body.data.skippedAt).toBeNull();
    });

    describe("reserved slots", () => {
      async function reserve(queueNumber: number, reservedFor = "VIP Guest") {
        const res = await request(app)
          .post("/api/v1/queue/reserve")
          .set(authHeader(doctorToken))
          .send({ reservedFor, queueNumber });
        expect(res.status).toBe(201);
        return res.body.data;
      }

      it("an empty reserved slot is never called", async () => {
        await reserve(1);

        const none = await request(app)
          .post("/api/v1/queue/call-next")
          .set(authHeader(doctorToken));
        expect(none.status).toBe(404);
      });

      it("an empty reserved slot cannot be recalled either", async () => {
        const slot = await reserve(1);

        const res = await request(app)
          .patch(`/api/v1/queue/${slot.id}/recall`)
          .set(authHeader(doctorToken));
        expect(res.status).toBe(400);
      });

      it("a present walk-in is called instead of the empty reserved slot", async () => {
        await reserve(1);
        const patient = await createPatient(clinic.id, doctor.id);
        await checkInWalkIn(patient.id);

        const called = await request(app)
          .post("/api/v1/queue/call-next")
          .set(authHeader(doctorToken));
        expect(called.status).toBe(200);
        expect(called.body.data.isReserved).toBe(false);
        expect(called.body.data.visit.patient.id).toBe(patient.id);
      });

      it("check-in turns the reserved slot into a real queue entry", async () => {
        const slot = await reserve(2, "Mrs. Salma");
        const patient = await createPatient(clinic.id, doctor.id);

        const res = await request(app)
          .post(`/api/v1/queue/${slot.id}/check-in`)
          .set(authHeader(doctorToken))
          .send({ patientId: patient.id, chiefComplaint: "Headache" });

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(slot.id);
        expect(res.body.data.status).toBe("WAITING");
        expect(res.body.data.queueNumber).toBe(2);
        expect(res.body.data.isReserved).toBe(true);
        expect(res.body.data.checkedInAt).toBeTruthy();
        expect(res.body.data.visit.patient.id).toBe(patient.id);
      });

      it("after check-in the reserved patient is served before walk-ins who arrived earlier", async () => {
        const slot = await reserve(1);
        const walkIn = await createPatient(clinic.id, doctor.id);
        const reservedPatient = await createPatient(clinic.id, doctor.id);

        await checkInWalkIn(walkIn.id);
        await request(app)
          .post(`/api/v1/queue/${slot.id}/check-in`)
          .set(authHeader(doctorToken))
          .send({ patientId: reservedPatient.id });

        expect(await callAndServe()).toBe(reservedPatient.id);
        expect(await callAndServe()).toBe(walkIn.id);
      });

      it("rejects checking in a reserved slot twice", async () => {
        const slot = await reserve(1);
        const p1 = await createPatient(clinic.id, doctor.id);
        const p2 = await createPatient(clinic.id, doctor.id);

        await request(app)
          .post(`/api/v1/queue/${slot.id}/check-in`)
          .set(authHeader(doctorToken))
          .send({ patientId: p1.id });

        const again = await request(app)
          .post(`/api/v1/queue/${slot.id}/check-in`)
          .set(authHeader(doctorToken))
          .send({ patientId: p2.id });
        expect(again.status).toBe(409);
      });

      it("rejects the same patient already being in today's queue", async () => {
        const slot = await reserve(1);
        const patient = await createPatient(clinic.id, doctor.id);
        await checkInWalkIn(patient.id);

        const res = await request(app)
          .post(`/api/v1/queue/${slot.id}/check-in`)
          .set(authHeader(doctorToken))
          .send({ patientId: patient.id });
        expect(res.status).toBe(409);
      });

      it("rejects an unknown patient", async () => {
        const slot = await reserve(1);
        const res = await request(app)
          .post(`/api/v1/queue/${slot.id}/check-in`)
          .set(authHeader(doctorToken))
          .send({ patientId: "11111111-1111-4111-8111-111111111111" });
        expect(res.status).toBe(404);
      });

      it("rejects a regular queue entry that is not a reserved slot", async () => {
        const patient = await createPatient(clinic.id, doctor.id);
        const entry = await checkInWalkIn(patient.id);
        const other = await createPatient(clinic.id, doctor.id);

        const res = await request(app)
          .post(`/api/v1/queue/${entry.id}/check-in`)
          .set(authHeader(doctorToken))
          .send({ patientId: other.id });
        expect(res.status).toBe(400);
      });

      it("rejects an invalid payload", async () => {
        const slot = await reserve(1);
        const res = await request(app)
          .post(`/api/v1/queue/${slot.id}/check-in`)
          .set(authHeader(doctorToken))
          .send({ patientId: "not-a-uuid" });
        expect(res.status).toBe(400);
      });
    });

    it("serves walk-ins in arrival order", async () => {
      const p1 = await createPatient(clinic.id, doctor.id);
      const p2 = await createPatient(clinic.id, doctor.id);
      await checkInWalkIn(p1.id);
      await checkInWalkIn(p2.id);

      const called = await request(app)
        .post("/api/v1/queue/call-next")
        .set(authHeader(doctorToken));
      expect(called.body.data.visit.patient.id).toBe(p1.id);
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
