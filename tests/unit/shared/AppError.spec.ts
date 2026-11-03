import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  TooManyRequestsError,
  InternalServerError,
  HttpStatus,
} from "../../../src/shared/errors/AppError";

describe("AppError hierarchy", () => {
  it("defaults to 500 internal server error and operational=true", () => {
    const err = new AppError("Something broke");
    expect(err.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(err.isOperational).toBe(true);
    expect(err.message).toBe("Something broke");
  });

  it("BadRequestError maps to 400 and carries field errors", () => {
    const err = new BadRequestError("Bad input", [
      { field: "x", message: "required" },
    ]);
    expect(err.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(err.errors).toEqual([{ field: "x", message: "required" }]);
    expect(err).toBeInstanceOf(AppError);
  });

  it("UnauthorizedError maps to 401", () => {
    expect(new UnauthorizedError().statusCode).toBe(HttpStatus.UNAUTHORIZED);
  });

  it("ForbiddenError maps to 403", () => {
    expect(new ForbiddenError().statusCode).toBe(HttpStatus.FORBIDDEN);
  });

  it("NotFoundError maps to 404", () => {
    expect(new NotFoundError().statusCode).toBe(HttpStatus.NOT_FOUND);
  });

  it("ConflictError maps to 409", () => {
    expect(new ConflictError().statusCode).toBe(HttpStatus.CONFLICT);
  });

  it("UnprocessableEntityError maps to 422", () => {
    expect(new UnprocessableEntityError().statusCode).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY
    );
  });

  it("TooManyRequestsError maps to 429", () => {
    expect(new TooManyRequestsError().statusCode).toBe(
      HttpStatus.TOO_MANY_REQUESTS
    );
  });

  it("InternalServerError is non-operational", () => {
    const err = new InternalServerError();
    expect(err.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(err.isOperational).toBe(false);
  });

  it("preserves instanceof across subclasses", () => {
    const err = new NotFoundError("missing");
    expect(err instanceof NotFoundError).toBe(true);
    expect(err instanceof AppError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});
