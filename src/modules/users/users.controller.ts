// src/modules/users/users.controller.ts

import type { Request, Response } from "express";
import * as UsersService from "./users.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import { createReceptionistSchema } from "./users.validation";
import { AppError, HttpStatus } from "../../shared/errors/AppError";

// ---------------------------------------------------------------------------
// POST /users/receptionist
// ---------------------------------------------------------------------------

export const createReceptionist = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
    }

    const input = createReceptionistSchema.parse(req.body);

    const user = await UsersService.createReceptionist(
      req.user.clinicId,
      input
    );

    ApiResponse.created(res, user, "Receptionist account created successfully");
  }
);
