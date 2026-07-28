// src/modules/auth/auth.controller.ts

import type { Request, Response } from "express";
import * as AuthService from "./auth.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import {
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
} from "./auth.validation";
import { AppError, HttpStatus } from "../../shared/errors/AppError";

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const result = await AuthService.login(input);

  ApiResponse.ok(res, result, "Login successful");
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const input = refreshTokenSchema.parse(req.body);
  const tokens = await AuthService.refreshTokens(input.refreshToken);

  ApiResponse.ok(res, tokens, "Tokens refreshed successfully");
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  ApiResponse.ok(res, null, "Logged out successfully");
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  }

  const user = await AuthService.getCurrentUser(req.user.sub);

  ApiResponse.ok(res, user, "User retrieved successfully");
});

// ---------------------------------------------------------------------------
// PATCH /auth/change-password
// ---------------------------------------------------------------------------

export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
    }

    const input = changePasswordSchema.parse(req.body);
    await AuthService.changePassword(req.user.sub, input);

    ApiResponse.ok(res, null, "Password changed successfully");
  }
);
