import jwt from "jsonwebtoken";
import { authMiddleware } from "../../../src/modules/auth/auth.middleware";
import config from "../../../src/config";
import { UnauthorizedError } from "../../../src/shared/errors/AppError";

function buildToken(
  overrides: Record<string, unknown> = {},
  secret = config.jwt.secret
) {
  return jwt.sign(
    {
      sub: "user-1",
      clinicId: "clinic-1",
      role: "DOCTOR",
      type: "access",
      ...overrides,
    },
    secret,
    { expiresIn: "5m" }
  );
}

describe("authMiddleware", () => {
  it("rejects when Authorization header missing", () => {
    const next = jest.fn();
    authMiddleware({ headers: {} } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects when scheme is not Bearer", () => {
    const next = jest.fn();
    authMiddleware(
      { headers: { authorization: "Basic abc123" } } as any,
      {} as any,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects an invalid/garbage token", () => {
    const next = jest.fn();
    authMiddleware(
      { headers: { authorization: "Bearer not-a-real-token" } } as any,
      {} as any,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects an expired token", () => {
    const token = jwt.sign(
      { sub: "u", clinicId: "c", role: "DOCTOR", type: "access" },
      config.jwt.secret,
      { expiresIn: -10 }
    );
    const next = jest.fn();
    authMiddleware(
      { headers: { authorization: `Bearer ${token}` } } as any,
      {} as any,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects a refresh-type token used as access token", () => {
    const token = buildToken({ type: "refresh" });
    const next = jest.fn();
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    authMiddleware(req, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = buildToken({}, "wrong-secret");
    const next = jest.fn();
    authMiddleware(
      { headers: { authorization: `Bearer ${token}` } } as any,
      {} as any,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("attaches req.user and calls next() on a valid access token", () => {
    const token = buildToken();
    const next = jest.fn();
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    authMiddleware(req, {} as any, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({
      sub: "user-1",
      clinicId: "clinic-1",
      role: "DOCTOR",
      type: "access",
    });
  });
});
