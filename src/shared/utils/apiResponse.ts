// src/shared/utils/apiResponse.ts

import { Response } from "express";
import { HttpStatus } from "../errors/AppError";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string>[];
  stack?: string;
}

// ---------------------------------------------------------------------------
// Success responses
// ---------------------------------------------------------------------------

function ok<T>(res: Response, data: T, message = "Success"): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    message,
    data,
  };
  return res.status(HttpStatus.OK).json(body);
}

function created<T>(
  res: Response,
  data: T,
  message = "Resource created successfully"
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    message,
    data,
  };
  return res.status(HttpStatus.CREATED).json(body);
}

function noContent(res: Response): Response {
  return res.status(HttpStatus.NO_CONTENT).send();
}

function paginated<T>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
  message = "Success"
): Response {
  const body: ApiSuccessResponse<T[]> & { meta: PaginationMeta } = {
    success: true,
    message,
    data,
    meta,
  };
  return res.status(HttpStatus.OK).json(body);
}

// ---------------------------------------------------------------------------
// Error responses
// ---------------------------------------------------------------------------

function error(
  res: Response,
  statusCode: number,
  message: string,
  errors?: Record<string, string>[],
  stack?: string
): Response {
  const body: ApiErrorResponse = {
    success: false,
    message,
    ...(errors && errors.length > 0 && { errors }),
    ...(stack && { stack }),
  };
  return res.status(statusCode).json(body);
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

// ---------------------------------------------------------------------------
// Named export so controllers use: ApiResponse.ok(), ApiResponse.created()
// ---------------------------------------------------------------------------

export const ApiResponse = {
  ok,
  created,
  noContent,
  paginated,
  error,
  buildPaginationMeta,
} as const;

export type { PaginationMeta, ApiSuccessResponse, ApiErrorResponse };
