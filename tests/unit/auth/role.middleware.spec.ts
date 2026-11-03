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
