import { requireRoles } from "../../../src/modules/auth/role.middleware";
import {
  UnauthorizedError,
  ForbiddenError,
} from "../../../src/shared/errors/AppError";

describe("requireRoles middleware", () => {
  it("calls next with UnauthorizedError when req.user is missing", () => {
    const middleware = requireRoles("DOCTOR");
    const next = jest.fn();
    middleware({} as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("calls next with ForbiddenError when role is not permitted", () => {
    const middleware = requireRoles("DOCTOR");
    const next = jest.fn();
    const req: any = { user: { role: "RECEPTIONIST" } };
    middleware(req, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("calls next() with no arguments when role matches", () => {
    const middleware = requireRoles("DOCTOR", "RECEPTIONIST");
    const next = jest.fn();
    const req: any = { user: { role: "RECEPTIONIST" } };
    middleware(req, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe("requireClinicAdmin middleware", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { requireClinicAdmin } = require("../../../src/modules/auth/role.middleware");

  it("rejects when req.user is missing", () => {
    const next = jest.fn();
    requireClinicAdmin({} as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects a plain doctor", () => {
    const next = jest.fn();
    requireClinicAdmin(
      { user: { role: "DOCTOR", isClinicAdmin: false } } as any,
      {} as any,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("rejects a doctor whose flag is missing", () => {
    const next = jest.fn();
    requireClinicAdmin({ user: { role: "DOCTOR" } } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("rejects a receptionist even if the flag were somehow set", () => {
    const next = jest.fn();
    requireClinicAdmin(
      { user: { role: "RECEPTIONIST", isClinicAdmin: true } } as any,
      {} as any,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("allows a clinic administrator", () => {
    const next = jest.fn();
    requireClinicAdmin(
      { user: { role: "DOCTOR", isClinicAdmin: true } } as any,
      {} as any,
      next
    );
    expect(next).toHaveBeenCalledWith();
  });
});
