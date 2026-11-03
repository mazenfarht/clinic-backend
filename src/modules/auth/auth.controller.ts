// src/modules/auth/auth.controller.ts

import type { Request, Response } from "express";
import * as AuthService from "./auth.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import {
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  changePasswordSchema,
} from "./auth.validation";
import { AppError, HttpStatus } from "../../shared/errors/AppError";
import type { SessionMeta } from "./auth.types";

// Device info stored with each refresh token (useful to spot odd sessions)
function sessionMeta(req: Request): SessionMeta {
  return { userAgent: req.get("user-agent") ?? undefined, ip: req.ip };
}

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const result = await AuthService.login(input, sessionMeta(req));

  ApiResponse.ok(res, result, "Login successful");
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const input = refreshTokenSchema.parse(req.body);
  const tokens = await AuthService.refreshTokens(
    input.refreshToken,
    sessionMeta(req)
  );

  ApiResponse.ok(res, tokens, "Tokens refreshed successfully");
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  }

  const input = logoutSchema.parse(req.body ?? {});
  await AuthService.logout(req.user.sub, input);

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
    // Every other session is ended; this one continues with the new tokens.
    const tokens = await AuthService.changePassword(
      req.user.sub,
      input,
      sessionMeta(req)
    );

    ApiResponse.ok(res, { tokens }, "Password changed successfully");
  }
);
