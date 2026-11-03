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
