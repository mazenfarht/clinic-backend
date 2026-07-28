// src/shared/errors/AppError.ts

export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: Record<string, string>[];

  constructor(
    message: string,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    isOperational: boolean = true,
    errors?: Record<string, string>[]
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;

    // Restores the correct prototype chain so `instanceof AppError` works
    // correctly after TypeScript compiles down to ES5.
    Object.setPrototypeOf(this, new.target.prototype);

    // Captures a clean stack trace that starts at the call site, not inside
    // this constructor.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ---------------------------------------------------------------------------
// Subclasses — strongly typed, self-documenting throw sites
// ---------------------------------------------------------------------------

export class BadRequestError extends AppError {
  constructor(message = "Bad request", errors?: Record<string, string>[]) {
    super(message, HttpStatus.BAD_REQUEST, true, errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, HttpStatus.UNAUTHORIZED, true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, HttpStatus.FORBIDDEN, true);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, HttpStatus.NOT_FOUND, true);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, HttpStatus.CONFLICT, true);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(
    message = "Unprocessable entity",
    errors?: Record<string, string>[]
  ) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, true, errors);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super(message, HttpStatus.TOO_MANY_REQUESTS, true);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal server error") {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, false);
  }
}
