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

describe("PATCH /api/v1/doctors/:id", () => {
  let clinic: TestClinic;
  let otherClinic: TestClinic;
  let doctorA: TestUser;
  let doctorB: TestUser;
  let receptionist: TestUser;
  let outsiderDoctor: TestUser;

  beforeAll(async () => {
    clinic = await createClinic();
    otherClinic = await createClinic();

    // Two doctors in the SAME clinic — doctorA must only be able to edit
    // their own profile, never doctorB's.
    doctorA = await createUser(clinic.id, "DOCTOR", {
      email: "doctors-a@example.com",
    });
    doctorB = await createUser(clinic.id, "DOCTOR", {
      email: "doctors-b@example.com",
    });
    receptionist = await createUser(clinic.id, "RECEPTIONIST", {
      email: "doctors-receptionist@example.com",
    });

    // A doctor in a completely different clinic, to check cross-clinic
    // scoping still behaves (should be 404, not 403 — they're not even
    // allowed to know this id exists).
    outsiderDoctor = await createUser(otherClinic.id, "DOCTOR", {
      email: "doctors-outsider@example.com",
    });
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
    await deleteClinicCascade(otherClinic.id);
  });

  it("rejects without authentication", async () => {
    const res = await request(app)
      .patch(`/api/v1/doctors/${doctorA.doctorId}`)
      .send({ specialty: "Cardiology" });
    expect(res.status).toBe(401);
  });

  it("rejects a RECEPTIONIST (role restricted to DOCTOR)", async () => {
    const token = signAccessToken(receptionist as any);
    const res = await request(app)
      .patch(`/api/v1/doctors/${doctorA.doctorId}`)
      .set(authHeader(token))
      .send({ specialty: "Cardiology" });
    expect(res.status).toBe(403);
  });

  it("lets a doctor update their own profile", async () => {
    const token = signAccessToken(doctorA as any);
    const res = await request(app)
      .patch(`/api/v1/doctors/${doctorA.doctorId}`)
      .set(authHeader(token))
      .send({ specialty: "Cardiology" });
    expect(res.status).toBe(200);
    expect(res.body.data.specialty).toBe("Cardiology");
  });

  // Regression test for the cross-doctor IDOR: a DOCTOR login must never be
  // able to edit a colleague's profile (specialty, isBookable, working
  // hours, ...) just by knowing their doctorId.
  it("rejects a doctor updating a DIFFERENT doctor's profile in the same clinic", async () => {
    const token = signAccessToken(doctorA as any);
    const res = await request(app)
      .patch(`/api/v1/doctors/${doctorB.doctorId}`)
      .set(authHeader(token))
      .send({ specialty: "Hacked", isBookable: false });
    expect(res.status).toBe(403);

    // doctorB's profile must be untouched.
    const check = await request(app)
      .get("/api/v1/doctors")
      .set(authHeader(signAccessToken(doctorB as any)));
    const stillB = check.body.data.find(
      (d: { id: string }) => d.id === doctorB.doctorId
    );
    expect(stillB.specialty).not.toBe("Hacked");
  });

  // A DOCTOR login is now locked to its own doctorId before the service
  // layer ever runs a clinic-scoped lookup, so a doctor from a completely
  // different clinic is rejected the same way as one from the same clinic:
  // "not your profile" (403), not "not found" (404) — they were never going
  // to be allowed to touch it regardless of which clinic it belongs to.
  it("rejects a doctor from another clinic entirely", async () => {
    const token = signAccessToken(outsiderDoctor as any);
    const res = await request(app)
      .patch(`/api/v1/doctors/${doctorA.doctorId}`)
      .set(authHeader(token))
      .send({ specialty: "Cardiology" });
    expect(res.status).toBe(403);
  });
});
