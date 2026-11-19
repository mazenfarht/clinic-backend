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

describe("POST /api/v1/users/receptionist", () => {
  let clinic: TestClinic;
  let doctor: TestUser;
  let receptionist: TestUser;

  beforeAll(async () => {
    clinic = await createClinic();
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "users-doctor@example.com",
      isClinicAdmin: true,
    });
    receptionist = await createUser(clinic.id, "RECEPTIONIST", {
      email: "users-receptionist@example.com",
    });
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  it("rejects without authentication", async () => {
    const res = await request(app)
      .post("/api/v1/users/receptionist")
      .send({
        email: "new@example.com",
        password: "Str0ng!Pass1",
        fullName: "New Recep",
      });
    expect(res.status).toBe(401);
  });

  it("rejects when caller is a RECEPTIONIST (role restricted to DOCTOR)", async () => {
    const token = signAccessToken(receptionist as any);
    const res = await request(app)
      .post("/api/v1/users/receptionist")
      .set(authHeader(token))
      .send({
        email: "new2@example.com",
        password: "Str0ng!Pass1",
        fullName: "New Recep",
      });
    expect(res.status).toBe(403);
  });

  it("rejects invalid payloads (weak password)", async () => {
    const token = signAccessToken(doctor as any);
    const res = await request(app)
      .post("/api/v1/users/receptionist")
      .set(authHeader(token))
      .send({
        email: "weak@example.com",
        password: "weak",
        fullName: "Weak Pass",
      });
    expect(res.status).toBe(400);
  });

  it("creates a receptionist as DOCTOR", async () => {
    const token = signAccessToken(doctor as any);
    const res = await request(app)
      .post("/api/v1/users/receptionist")
      .set(authHeader(token))
      .send({
        email: "fresh-receptionist@example.com",
        password: "Str0ng!Pass1",
        fullName: "Fresh Receptionist",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("RECEPTIONIST");
    expect(res.body.data.email).toBe("fresh-receptionist@example.com");
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate email within the same clinic with 409", async () => {
    const token = signAccessToken(doctor as any);
    const payload = {
      email: "dup-receptionist@example.com",
      password: "Str0ng!Pass1",
      fullName: "Dup Receptionist",
    };
    const first = await request(app)
      .post("/api/v1/users/receptionist")
      .set(authHeader(token))
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/users/receptionist")
      .set(authHeader(token))
      .send(payload);
    expect(second.status).toBe(409);
  });
});

describe("Clinic administrator gate on staff management", () => {
  let clinic: TestClinic;
  let admin: TestUser;
  let plainDoctor: TestUser;
  let otherDoctor: TestUser;
  let receptionist: TestUser;

  beforeAll(async () => {
    clinic = await createClinic();
    admin = await createUser(clinic.id, "DOCTOR", { isClinicAdmin: true });
    plainDoctor = await createUser(clinic.id, "DOCTOR");
    otherDoctor = await createUser(clinic.id, "DOCTOR");
    receptionist = await createUser(clinic.id, "RECEPTIONIST");
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  it("forbids a plain doctor from creating a receptionist", async () => {
    const res = await request(app)
      .post("/api/v1/users/receptionist")
      .set(authHeader(signAccessToken(plainDoctor as any)))
      .send({
        email: "blocked@example.com",
        password: "Str0ng!Pass1",
        fullName: "Blocked Recep",
      });
    expect(res.status).toBe(403);
  });

  it("forbids a plain doctor from listing users", async () => {
    const res = await request(app)
      .get("/api/v1/users")
      .set(authHeader(signAccessToken(plainDoctor as any)));
    expect(res.status).toBe(403);
  });

  it("forbids a plain doctor from deactivating another doctor", async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${otherDoctor.id}/status`)
      .set(authHeader(signAccessToken(plainDoctor as any)))
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  it("lets the clinic administrator list users", async () => {
    const res = await request(app)
      .get("/api/v1/users")
      .set(authHeader(signAccessToken(admin as any)));
    expect(res.status).toBe(200);
  });

  it("lets the administrator grant and revoke the admin role on a doctor", async () => {
    const token = signAccessToken(admin as any);

    const grant = await request(app)
      .patch(`/api/v1/users/${plainDoctor.id}/admin`)
      .set(authHeader(token))
      .send({ isClinicAdmin: true });
    expect(grant.status).toBe(200);
    expect(grant.body.data.isClinicAdmin).toBe(true);

    // takes effect immediately: the flag is read from the database per request
    const nowAllowed = await request(app)
      .get("/api/v1/users")
      .set(authHeader(signAccessToken(plainDoctor as any)));
    expect(nowAllowed.status).toBe(200);

    const revoke = await request(app)
      .patch(`/api/v1/users/${plainDoctor.id}/admin`)
      .set(authHeader(token))
      .send({ isClinicAdmin: false });
    expect(revoke.status).toBe(200);

    const blockedAgain = await request(app)
      .get("/api/v1/users")
      .set(authHeader(signAccessToken(plainDoctor as any)));
    expect(blockedAgain.status).toBe(403);
  });

  it("rejects changing your own admin role", async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${admin.id}/admin`)
      .set(authHeader(signAccessToken(admin as any)))
      .send({ isClinicAdmin: false });
    expect(res.status).toBe(400);
  });

  it("rejects making a receptionist an administrator", async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${receptionist.id}/admin`)
      .set(authHeader(signAccessToken(admin as any)))
      .send({ isClinicAdmin: true });
    expect(res.status).toBe(400);
  });
});
