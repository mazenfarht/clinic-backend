import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../helpers/app";
import prisma from "../helpers/prisma";
import config from "../../src/config";
import {
  createClinic,
  createUser,
  deleteClinicCascade,
  createPlatformAdmin,
  deletePlatformAdmin,
  signAccessToken,
  signAdminToken,
  signExpiredAdminToken,
  authHeader,
  DEFAULT_PASSWORD,
  TestClinic,
  TestPlatformAdmin,
} from "../helpers/factories";

const NEW_PASSWORD = "N3w!Passw0rdXyz";
const BASE = "/api/v1/admin/auth";

describe("Admin auth module", () => {
  const created: string[] = [];

  async function makeAdmin(
    overrides: Parameters<typeof createPlatformAdmin>[0] = {}
  ): Promise<TestPlatformAdmin> {
    const admin = await createPlatformAdmin(overrides);
    created.push(admin.id);
    return admin;
  }

  afterAll(async () => {
    for (const id of created) await deletePlatformAdmin(id);
  });

  describe("POST /admin/auth/login", () => {
    it("rejects a missing email with 400", async () => {
      const res = await request(app)
        .post(`${BASE}/login`)
        .send({ password: DEFAULT_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects an unknown email with 401", async () => {
      const res = await request(app)
        .post(`${BASE}/login`)
        .send({ email: "nobody@example.com", password: DEFAULT_PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid email or password/i);
    });

    it("rejects a wrong password with the same 401 message", async () => {
      const admin = await makeAdmin();
      const res = await request(app)
        .post(`${BASE}/login`)
        .send({ email: admin.email, password: "WrongPassw0rd!" });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid email or password/i);
    });

    it("does not reveal a deactivated account to a wrong password", async () => {
      const admin = await makeAdmin({ isActive: false });
      const res = await request(app)
        .post(`${BASE}/login`)
        .send({ email: admin.email, password: "WrongPassw0rd!" });
      expect(res.status).toBe(401);
    });

    it("rejects a deactivated admin with the right password (403)", async () => {
      const admin = await makeAdmin({ isActive: false });
      const res = await request(app)
        .post(`${BASE}/login`)
        .send({ email: admin.email, password: admin.plainPassword });
      expect(res.status).toBe(403);
    });

    it("logs in, returns admin + session, and never leaks secrets", async () => {
      const admin = await makeAdmin();
      const res = await request(app)
        .post(`${BASE}/login`)
        .send({ email: admin.email, password: admin.plainPassword });

      expect(res.status).toBe(200);
      expect(res.body.data.admin.email).toBe(admin.email);
      expect(res.body.data.session.accessToken).toEqual(expect.any(String));
      expect(new Date(res.body.data.session.expiresAt).getTime()).toBeGreaterThan(
        Date.now()
      );
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/passwordHash|tokenVersion|refresh/i);

      const claims = jwt.decode(res.body.data.session.accessToken) as {
        sub: string;
        type: string;
        tv: number;
      };
      expect(claims.sub).toBe(admin.id);
      expect(claims.type).toBe("admin");
      expect(claims.tv).toBe(0);

      const row = await prisma.platformAdmin.findUnique({
        where: { id: admin.id },
      });
      expect(row?.lastLogin).not.toBeNull();
    });

    it("treats the email case-insensitively and trims it", async () => {
      const admin = await makeAdmin({ email: "mixed-case-admin@example.com" });
      const res = await request(app)
        .post(`${BASE}/login`)
        .send({
          email: "  Mixed-Case-Admin@Example.COM ",
          password: admin.plainPassword,
        });
      expect(res.status).toBe(200);
    });
  });

  describe("token validation (GET /admin/auth/me)", () => {
    it("returns the admin for a valid token", async () => {
      const admin = await makeAdmin();
      const res = await request(app)
        .get(`${BASE}/me`)
        .set(authHeader(signAdminToken(admin.id)));
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(admin.email);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });

    it("rejects a missing, malformed or garbage token", async () => {
      expect((await request(app).get(`${BASE}/me`)).status).toBe(401);
      expect(
        (
          await request(app)
            .get(`${BASE}/me`)
            .set({ Authorization: "Basic abc" })
        ).status
      ).toBe(401);
      expect(
        (await request(app).get(`${BASE}/me`).set(authHeader("garbage"))).status
      ).toBe(401);
    });

    it("rejects an expired token", async () => {
      const admin = await makeAdmin();
      const res = await request(app)
        .get(`${BASE}/me`)
        .set(authHeader(signExpiredAdminToken(admin.id)));
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired/i);
    });

    it("rejects a token signed with another secret", async () => {
      const admin = await makeAdmin();
      const forged = jwt.sign(
        { sub: admin.id, tv: 0, type: "admin" },
        "x".repeat(40),
        { expiresIn: 60 }
      );
      const res = await request(app).get(`${BASE}/me`).set(authHeader(forged));
      expect(res.status).toBe(401);
    });

    it("rejects the admin secret with a non-admin token type", async () => {
      const admin = await makeAdmin();
      const wrongType = jwt.sign(
        { sub: admin.id, tv: 0, type: "access" },
        config.adminJwt.secret,
        { expiresIn: 60 }
      );
      const res = await request(app)
        .get(`${BASE}/me`)
        .set(authHeader(wrongType));
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/token type/i);
    });

    it("rejects a token for an admin that does not exist", async () => {
      const res = await request(app)
        .get(`${BASE}/me`)
        .set(authHeader(signAdminToken("00000000-0000-4000-8000-000000000000")));
      expect(res.status).toBe(401);
    });

    it("rejects a token whose tokenVersion no longer matches", async () => {
      const admin = await makeAdmin();
      const res = await request(app)
        .get(`${BASE}/me`)
        .set(authHeader(signAdminToken(admin.id, 5)));
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/revoked/i);
    });

    it("locks a deactivated admin out immediately (403)", async () => {
      const admin = await makeAdmin();
      const token = signAdminToken(admin.id);
      await prisma.platformAdmin.update({
        where: { id: admin.id },
        data: { isActive: false },
      });
      const res = await request(app).get(`${BASE}/me`).set(authHeader(token));
      expect(res.status).toBe(403);
    });
  });

  describe("separation from clinic tokens", () => {
    let clinic: TestClinic;

    beforeAll(async () => {
      clinic = await createClinic();
    });

    afterAll(async () => {
      await deleteClinicCascade(clinic.id);
    });

    it("rejects a clinic user's token on admin routes", async () => {
      const doctor = await createUser(clinic.id, "DOCTOR");
      const res = await request(app)
        .get(`${BASE}/me`)
        .set(authHeader(signAccessToken(doctor)));
      expect(res.status).toBe(401);
    });

    it("rejects an admin token on clinic routes", async () => {
      const admin = await makeAdmin();
      const res = await request(app)
        .get("/api/v1/patients")
        .set(authHeader(signAdminToken(admin.id)));
      expect(res.status).toBe(401);
    });
  });

  describe("POST /admin/auth/logout", () => {
    it("requires authentication", async () => {
      expect((await request(app).post(`${BASE}/logout`)).status).toBe(401);
    });

    it("ends the session: the same token stops working", async () => {
      const admin = await makeAdmin();
      const token = signAdminToken(admin.id);

      const out = await request(app)
        .post(`${BASE}/logout`)
        .set(authHeader(token));
      expect(out.status).toBe(200);

      const after = await request(app).get(`${BASE}/me`).set(authHeader(token));
      expect(after.status).toBe(401);
    });
  });

  describe("PATCH /admin/auth/change-password", () => {
    it("requires authentication", async () => {
      expect((await request(app).patch(`${BASE}/change-password`)).status).toBe(
        401
      );
    });

    it("rejects a wrong current password (401)", async () => {
      const admin = await makeAdmin();
      const res = await request(app)
        .patch(`${BASE}/change-password`)
        .set(authHeader(signAdminToken(admin.id)))
        .send({
          currentPassword: "Wrong1!pass",
          newPassword: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        });
      expect(res.status).toBe(401);
    });

    it("rejects weak, mismatched or unchanged passwords (400)", async () => {
      const admin = await makeAdmin();
      const token = signAdminToken(admin.id);
      const send = (body: object) =>
        request(app)
          .patch(`${BASE}/change-password`)
          .set(authHeader(token))
          .send(body);

      expect(
        (
          await send({
            currentPassword: admin.plainPassword,
            newPassword: "weak",
            confirmPassword: "weak",
          })
        ).status
      ).toBe(400);
      expect(
        (
          await send({
            currentPassword: admin.plainPassword,
            newPassword: NEW_PASSWORD,
            confirmPassword: NEW_PASSWORD + "x",
          })
        ).status
      ).toBe(400);
      expect(
        (
          await send({
            currentPassword: admin.plainPassword,
            newPassword: admin.plainPassword,
            confirmPassword: admin.plainPassword,
          })
        ).status
      ).toBe(400);
    });

    it("changes the password, kills old tokens, returns a working new one", async () => {
      const admin = await makeAdmin();
      const oldToken = signAdminToken(admin.id);

      const res = await request(app)
        .patch(`${BASE}/change-password`)
        .set(authHeader(oldToken))
        .send({
          currentPassword: admin.plainPassword,
          newPassword: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        });
      expect(res.status).toBe(200);
      const newToken: string = res.body.data.session.accessToken;

      expect(
        (await request(app).get(`${BASE}/me`).set(authHeader(oldToken))).status
      ).toBe(401);
      expect(
        (await request(app).get(`${BASE}/me`).set(authHeader(newToken))).status
      ).toBe(200);

      const oldLogin = await request(app)
        .post(`${BASE}/login`)
        .send({ email: admin.email, password: admin.plainPassword });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app)
        .post(`${BASE}/login`)
        .send({ email: admin.email, password: NEW_PASSWORD });
      expect(newLogin.status).toBe(200);
    });
  });
});
