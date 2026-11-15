// src/modules/admin/auth/admin-auth.controller.ts

import type { Request, Response } from "express";
import * as AdminAuthService from "./admin-auth.service";
import { ApiResponse } from "../../../shared/utils/apiResponse";
import asyncHandler from "../../../shared/utils/asyncHandler";
import { AppError, HttpStatus } from "../../../shared/errors/AppError";
import {
  adminLoginSchema,
  adminChangePasswordSchema,
} from "./admin-auth.validation";

function requireAdmin(req: Request) {
  if (!req.admin) {
    throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  }
  return req.admin;
}

// POST /admin/auth/login
export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = adminLoginSchema.parse(req.body);
  const result = await AdminAuthService.login(input);

  ApiResponse.ok(res, result, "Login successful");
});

// GET /admin/auth/me
export const me = asyncHandler(async (req: Request, res: Response) => {
  const admin = await AdminAuthService.getCurrentAdmin(requireAdmin(req).id);

  ApiResponse.ok(res, admin, "Admin retrieved successfully");
});

// POST /admin/auth/logout
export const logout = asyncHandler(async (req: Request, res: Response) => {
  await AdminAuthService.logout(requireAdmin(req).id);

  ApiResponse.ok(res, null, "Logged out. All admin sessions were ended.");
});

// PATCH /admin/auth/change-password
export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const input = adminChangePasswordSchema.parse(req.body);
    const session = await AdminAuthService.changePassword(
      requireAdmin(req).id,
      input
    );

    ApiResponse.ok(res, { session }, "Password changed successfully");
  }
);
