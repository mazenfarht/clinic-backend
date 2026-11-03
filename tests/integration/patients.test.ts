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

describe("Patients module", () => {
  let clinic: TestClinic;
  let doctor: TestUser;
  let receptionist: TestUser;
  let doctorToken: string;
  let receptionistToken: string;

  beforeAll(async () => {
    clinic = await createClinic();
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "pat-doctor@example.com",
    });
    receptionist = await createUser(clinic.id, "RECEPTIONIST", {
      email: "pat-receptionist@example.com",
    });
    doctorToken = signAccessToken(doctor as any);
    receptionistToken = signAccessToken(receptionist as any);
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  describe("POST /api/v1/patients", () => {
    const validPayload = {
      mrn: "MRN-TEST-001",
      fullName: "Alice Example",
      phone: "+19998887771",
      dateOfBirth: "1992-04-10",
      gender: "FEMALE",
    };

    it("rejects without authentication", async () => {
      const res = await request(app)
        .post("/api/v1/patients")
        .send(validPayload);
      expect(res.status).toBe(401);
    });

    it("rejects an invalid payload", async () => {
      const res = await request(app)
        .post("/api/v1/patients")
        .set(authHeader(doctorToken))
        .send({ ...validPayload, mrn: "" });
      expect(res.status).toBe(400);
      expect(res.body.errors?.length).toBeGreaterThan(0);
    });

    it("creates a patient as DOCTOR", async () => {
      const res = await request(app)
        .post("/api/v1/patients")
        .set(authHeader(doctorToken))
        .send(validPayload);
      expect(res.status).toBe(201);
      expect(res.body.data.mrn).toBe(validPayload.mrn);
    });

    it("creates a patient as RECEPTIONIST", async () => {
      const res = await request(app)
        .post("/api/v1/patients")
        .set(authHeader(receptionistToken))
        .send({ ...validPayload, mrn: "MRN-TEST-002", phone: "+19998887772" });
      expect(res.status).toBe(201);
    });

    it("rejects a duplicate MRN with 409", async () => {
      const res = await request(app)
        .post("/api/v1/patients")
        .set(authHeader(doctorToken))
        .send({ ...validPayload, phone: "+19998887773" });
      expect(res.status).toBe(409);
    });

    it("rejects a duplicate phone with 409", async () => {
      const res = await request(app)
        .post("/api/v1/patients")
        .set(authHeader(doctorToken))
        .send({ ...validPayload, mrn: "MRN-TEST-003" });
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/v1/patients", () => {
    it("rejects without authentication", async () => {
      const res = await request(app).get("/api/v1/patients");
      expect(res.status).toBe(401);
    });

    it("returns a paginated list for an authenticated user", async () => {
      await createPatient(clinic.id, doctor.id, { fullName: "List Patient" });

      const res = await request(app)
        .get("/api/v1/patients")
        .set(authHeader(doctorToken))
        .query({ page: 1, limit: 5 });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 5 });
    });

    it("filters by search term", async () => {
      await createPatient(clinic.id, doctor.id, {
        fullName: "Zebra Searchable",
      });

      const res = await request(app)
        .get("/api/v1/patients")
        .set(authHeader(doctorToken))
        .query({ search: "Zebra Searchable" });

      expect(res.status).toBe(200);
      expect(
        res.body.data.some((p: any) => p.fullName === "Zebra Searchable")
      ).toBe(true);
    });

    it("excludes soft-deleted patients by default", async () => {
      const deleted = await createPatient(clinic.id, doctor.id, {
        fullName: "Deleted By Default",
        deletedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/v1/patients")
        .set(authHeader(doctorToken))
        .query({ search: "Deleted By Default" });

      expect(
        res.body.data.find((p: any) => p.id === deleted.id)
      ).toBeUndefined();
    });

    it("includes soft-deleted patients when includeDeleted=true", async () => {
      const deleted = await createPatient(clinic.id, doctor.id, {
        fullName: "Deleted Visible",
        deletedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/v1/patients")
        .set(authHeader(doctorToken))
        .query({ search: "Deleted Visible", includeDeleted: "true" });

      expect(res.body.data.find((p: any) => p.id === deleted.id)).toBeDefined();
    });
  });

  describe("GET /api/v1/patients/:id", () => {
    it("returns 404 for a non-existent id", async () => {
      const res = await request(app)
        .get("/api/v1/patients/11111111-1111-1111-1111-111111111111")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(404);
    });

    it("returns 400 for a malformed id", async () => {
      const res = await request(app)
        .get("/api/v1/patients/not-a-uuid")
        .set(authHeader(doctorToken));
      expect(res.status).toBe(400);
    });

    it("returns the patient detail including visits/appointments", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .get(`/api/v1/patients/${patient.id}`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(patient.id);
      expect(Array.isArray(res.body.data.visits)).toBe(true);
      expect(Array.isArray(res.body.data.appointments)).toBe(true);
    });
  });

  describe("PATCH /api/v1/patients/:id", () => {
    it("returns 400 for an empty update body", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .patch(`/api/v1/patients/${patient.id}`)
        .set(authHeader(doctorToken))
        .send({});
      expect(res.status).toBe(400);
    });

    it("updates a patient field", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .patch(`/api/v1/patients/${patient.id}`)
        .set(authHeader(doctorToken))
        .send({ fullName: "Updated Name" });
      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe("Updated Name");
    });

    it("returns 409 when updating phone to one already in use", async () => {
      const p1 = await createPatient(clinic.id, doctor.id, {
        phone: "+15550001111",
      });
      const p2 = await createPatient(clinic.id, doctor.id, {
        phone: "+15550002222",
      });

      const res = await request(app)
        .patch(`/api/v1/patients/${p2.id}`)
        .set(authHeader(doctorToken))
        .send({ phone: p1.phone });
      expect(res.status).toBe(409);
    });

    it("returns 404 for a non-existent patient", async () => {
      const res = await request(app)
        .patch("/api/v1/patients/11111111-1111-1111-1111-111111111111")
        .set(authHeader(doctorToken))
        .send({ fullName: "Ghost" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/v1/patients/:id and PATCH /:id/restore", () => {
    it("soft-deletes a patient", async () => {
      const patient = await createPatient(clinic.id, doctor.id);

      const delRes = await request(app)
        .delete(`/api/v1/patients/${patient.id}`)
        .set(authHeader(doctorToken));
      expect(delRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/v1/patients/${patient.id}`)
        .set(authHeader(doctorToken));
      expect(getRes.status).toBe(404);
    });

    it("returns 400 when deleting an already-deleted patient", async () => {
      const patient = await createPatient(clinic.id, doctor.id, {
        deletedAt: new Date(),
      });
      const res = await request(app)
        .delete(`/api/v1/patients/${patient.id}`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(400);
    });

    it("restores a soft-deleted patient", async () => {
      const patient = await createPatient(clinic.id, doctor.id, {
        deletedAt: new Date(),
      });

      const restoreRes = await request(app)
        .patch(`/api/v1/patients/${patient.id}/restore`)
        .set(authHeader(doctorToken));
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.data.deletedAt).toBeNull();
    });

    it("returns 400 when restoring a non-deleted patient", async () => {
      const patient = await createPatient(clinic.id, doctor.id);
      const res = await request(app)
        .patch(`/api/v1/patients/${patient.id}/restore`)
        .set(authHeader(doctorToken));
      expect(res.status).toBe(400);
    });
  });
});
