import jwt from "jsonwebtoken";
import { authMiddleware } from "../../../src/modules/auth/auth.middleware";
import config from "../../../src/config";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../../src/shared/errors/AppError";

// authMiddleware checks the user against the database on every request, so the
// Prisma client is mocked here and no real database is touched by this spec.
jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: { user: { findUnique: jest.fn() } },
}));

import prisma from "../../../src/config/database";

const findUnique = prisma.user.findUnique as unknown as jest.Mock;

function buildToken(
  overrides: Record<string, unknown> = {},
  secret = config.jwt.secret
) {
  return jwt.sign(
    {
      sub: "user-1",
      clinicId: "clinic-1",
      role: "DOCTOR",
      tv: 0,
      type: "access",
      ...overrides,
    },
    secret,
    { expiresIn: "5m" }
  );
}

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    clinicId: "clinic-1",
    role: "DOCTOR",
    isActive: true,
    tokenVersion: 0,
    clinic: { isActive: true },
    ...overrides,
  };
}

// The middleware is async: await it so the assertions run after next() fired.
async function run(authorization?: string) {
  const next = jest.fn();
  const req: any = { headers: authorization ? { authorization } : {} };
  await authMiddleware(req, {} as any, next);
  return { req, next };
}

describe("authMiddleware", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("rejects when Authorization header missing", async () => {
    const { next } = await run();
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects when scheme is not Bearer", async () => {
    const { next } = await run("Basic abc123");
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects an invalid/garbage token", async () => {
    const { next } = await run("Bearer not-a-real-token");
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects an expired token", async () => {
    const token = jwt.sign(
      { sub: "u", clinicId: "c", role: "DOCTOR", tv: 0, type: "access" },
      config.jwt.secret,
      { expiresIn: -10 }
    );
    const { next } = await run(`Bearer ${token}`);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects a refresh-type token used as access token", async () => {
    const { next } = await run(`Bearer ${buildToken({ type: "refresh" })}`);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects a token signed with the wrong secret", async () => {
    const { next } = await run(`Bearer ${buildToken({}, "wrong-secret")}`);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects a token whose user no longer exists", async () => {
    findUnique.mockResolvedValue(null);
    const { next } = await run(`Bearer ${buildToken()}`);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects a token of a deactivated clinic", async () => {
    findUnique.mockResolvedValue(dbUser({ clinic: { isActive: false } }));
    const { next } = await run(`Bearer ${buildToken()}`);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects a deactivated user with 403", async () => {
    findUnique.mockResolvedValue(dbUser({ isActive: false }));
    const { next } = await run(`Bearer ${buildToken()}`);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("rejects a revoked token (tokenVersion mismatch)", async () => {
    findUnique.mockResolvedValue(dbUser({ tokenVersion: 3 }));
    const { next } = await run(`Bearer ${buildToken({ tv: 2 })}`);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("attaches req.user and calls next() on a valid access token", async () => {
    findUnique.mockResolvedValue(dbUser());
    const { req, next } = await run(`Bearer ${buildToken()}`);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({
      sub: "user-1",
      clinicId: "clinic-1",
      role: "DOCTOR",
      type: "access",
    });
  });

  it("uses the CURRENT role from the database, not the one in the token", async () => {
    findUnique.mockResolvedValue(dbUser({ role: "RECEPTIONIST" }));
    const { req, next } = await run(`Bearer ${buildToken({ role: "DOCTOR" })}`);
    expect(next).toHaveBeenCalledWith();
    expect(req.user.role).toBe("RECEPTIONIST");
  });

  it("forwards unexpected database failures to the error handler", async () => {
    const boom = new Error("db down");
    findUnique.mockRejectedValue(boom);
    const { next } = await run(`Bearer ${buildToken()}`);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
