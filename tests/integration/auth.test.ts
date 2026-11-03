import request from "supertest";
import app from "../helpers/app";
import prisma from "../helpers/prisma";
import {
  createClinic,
  createUser,
  deleteClinicCascade,
  signAccessToken,
  signRefreshToken,
  authHeader,
  DEFAULT_PASSWORD,
  TestClinic,
  TestUser,
} from "../helpers/factories";

describe("Auth module", () => {
  let clinic: TestClinic;
  let doctor: TestUser;

  beforeAll(async () => {
    clinic = await createClinic();
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "auth-doctor@example.com",
    });
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  describe("POST /api/v1/auth/login", () => {
    it("rejects a missing email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ password: DEFAULT_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects an unknown email with 401", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        email: "nobody@example.com",
        password: DEFAULT_PASSWORD,
      });
      expect(res.status).toBe(401);
    });

    it("rejects a wrong password with 401", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        email: doctor.email,
        password: "WrongPassw0rd!",
      });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid email or password/i);
    });

    it("rejects login for a deactivated user with 403", async () => {
      const inactive = await createUser(clinic.id, "RECEPTIONIST", {
        email: "inactive@example.com",
        isActive: false,
      });
      const res = await request(app).post("/api/v1/auth/login").send({
        email: inactive.email,
        password: inactive.plainPassword,
      });
      expect(res.status).toBe(403);
    });

    it("logs in successfully and returns user + tokens", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        email: doctor.email,
        password: doctor.plainPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toMatchObject({
        id: doctor.id,
        email: doctor.email,
        role: "DOCTOR",
      });
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(typeof res.body.data.tokens.accessToken).toBe("string");
      expect(typeof res.body.data.tokens.refreshToken).toBe("string");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("rejects a missing refreshToken", async () => {
      const res = await request(app).post("/api/v1/auth/refresh").send({});
      expect(res.status).toBe(400);
    });

    it("rejects a garbage refresh token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "garbage.token.value" });
      expect(res.status).toBe(401);
    });

    it("returns a new token pair for a valid refresh token", async () => {
      const refreshToken = signRefreshToken({
        id: doctor.id,
        clinicId: clinic.id,
      });
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken });
      expect(res.status).toBe(200);
      expect(typeof res.body.data.accessToken).toBe("string");
      expect(typeof res.body.data.refreshToken).toBe("string");
    });

    it("rejects a refresh token for a deactivated user with 403", async () => {
      const inactive = await createUser(clinic.id, "RECEPTIONIST", {
        email: "inactive-refresh@example.com",
        isActive: false,
      });
      const refreshToken = signRefreshToken({
        id: inactive.id,
        clinicId: clinic.id,
      });
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("rejects requests without a token", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
    });

    it("rejects requests with a malformed Bearer token", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer garbage");
      expect(res.status).toBe(401);
    });

    it("returns the current authenticated user", async () => {
      const token = signAccessToken(doctor as any);
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(doctor.id);
      expect(res.body.data.email).toBe(doctor.email);
    });

    it("returns 403 once the user has been deactivated", async () => {
      const temp = await createUser(clinic.id, "RECEPTIONIST", {
        email: "temp-deactivate@example.com",
      });
      const token = signAccessToken(temp as any);

      await prisma.user.update({
        where: { id: temp.id },
        data: { isActive: false },
      });

      const res = await request(app)
        .get("/api/v1/auth/me")
        .set(authHeader(token));
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("rejects without a token", async () => {
      const res = await request(app).post("/api/v1/auth/logout");
      expect(res.status).toBe(401);
    });

    it("logs out successfully with a valid token", async () => {
      const token = signAccessToken(doctor as any);
      const res = await request(app)
        .post("/api/v1/auth/logout")
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/logged out/i);
    });
  });

  describe("PATCH /api/v1/auth/change-password", () => {
    it("rejects without a token", async () => {
      const res = await request(app)
        .patch("/api/v1/auth/change-password")
        .send({});
      expect(res.status).toBe(401);
    });

    it("rejects a mismatched confirmPassword", async () => {
      const token = signAccessToken(doctor as any);
      const res = await request(app)
        .patch("/api/v1/auth/change-password")
        .set(authHeader(token))
        .send({
          currentPassword: doctor.plainPassword,
          newPassword: "NewPassw0rd!",
          confirmPassword: "Different1!",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an incorrect currentPassword", async () => {
      const token = signAccessToken(doctor as any);
      const res = await request(app)
        .patch("/api/v1/auth/change-password")
        .set(authHeader(token))
        .send({
          currentPassword: "WrongOne1!",
          newPassword: "NewPassw0rd!",
          confirmPassword: "NewPassw0rd!",
        });
      expect(res.status).toBe(401);
    });

    it("changes the password and allows login with the new one", async () => {
      const changeUser = await createUser(clinic.id, "DOCTOR", {
        email: "change-pw@example.com",
      });
      const token = signAccessToken(changeUser as any);

      const changeRes = await request(app)
        .patch("/api/v1/auth/change-password")
        .set(authHeader(token))
        .send({
          currentPassword: changeUser.plainPassword,
          newPassword: "BrandNew1!",
          confirmPassword: "BrandNew1!",
        });
      expect(changeRes.status).toBe(200);

      const loginRes = await request(app).post("/api/v1/auth/login").send({
        email: changeUser.email,
        password: "BrandNew1!",
      });
      expect(loginRes.status).toBe(200);
    });
  });
});
