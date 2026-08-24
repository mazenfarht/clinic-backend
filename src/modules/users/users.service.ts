// src/modules/users/users.service.ts

import bcrypt from "bcrypt";
import prisma from "../../config/database";
import config from "../../config";
import { ConflictError } from "../../shared/errors/AppError";
import type { CreateReceptionistInput } from "./users.validation";
import type { AuthenticatedUser } from "../auth/auth.types";

// ---------------------------------------------------------------------------
// Selector — mirrors userPublicSelect in auth.service to guarantee the same
// shape and to ensure passwordHash is never returned to callers.
// ---------------------------------------------------------------------------

const userPublicSelect = {
  id: true,
  clinicId: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Create Receptionist
// ---------------------------------------------------------------------------

export async function createReceptionist(
  clinicId: string,
  input: CreateReceptionistInput
): Promise<AuthenticatedUser> {
  // Enforce email uniqueness within the clinic
  const existing = await prisma.user.findFirst({
    where: { email: input.email, clinicId },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError("A user with this email already exists");
  }

  // Hash the password exactly as auth.service.ts does in changePassword()
  const passwordHash = await bcrypt.hash(
    input.password,
    config.bcrypt.saltRounds
  );

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: "RECEPTIONIST", // hardcoded — never sourced from input
      clinicId, // always from req.user.clinicId, passed by controller
      isActive: true,
    },
    select: userPublicSelect,
  });

  return user as AuthenticatedUser;
}
