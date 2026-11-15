// src/modules/admin/auth/admin-auth.service.ts

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../../config/database";
import config from "../../../config";
import {
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
} from "../../../shared/errors/AppError";
import type {
  AdminLoginResult,
  AdminProfile,
  AdminSession,
  JwtAdminPayload,
} from "./admin-auth.types";
import type {
  AdminLoginInput,
  AdminChangePasswordInput,
} from "./admin-auth.validation";

// A valid bcrypt hash of a random string. Compared against when the email is
// unknown so "no such admin" takes as long as "wrong password" (no timing leak).
const DUMMY_PASSWORD_HASH =
  "$2b$12$zimV.bKWyDRNu96ssOHSve3ZjJfVyc8wUZP43Wewzv/jZHgpafc/C";

const adminProfileSelect = {
  id: true,
  email: true,
  fullName: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export function signAdminToken(adminId: string, tokenVersion: number): AdminSession {
  const accessToken = jwt.sign(
    { sub: adminId, tv: tokenVersion, type: "admin" } satisfies JwtAdminPayload,
    config.adminJwt.secret,
    { algorithm: "HS256", expiresIn: config.adminJwt.expiresIn } as jwt.SignOptions
  );

  const { exp } = jwt.decode(accessToken) as { exp: number };
  return { accessToken, expiresAt: new Date(exp * 1000).toISOString() };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(input: AdminLoginInput): Promise<AdminLoginResult> {
  const admin = await prisma.platformAdmin.findUnique({
    where: { email: input.email },
    select: { ...adminProfileSelect, passwordHash: true, tokenVersion: true },
  });

  if (!admin) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    throw new UnauthorizedError("Invalid email or password");
  }

  const passwordOk = await bcrypt.compare(input.password, admin.passwordHash);
  if (!passwordOk) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // Checked only AFTER the password, so a deactivated account is not revealed
  // to someone who does not know the password.
  if (!admin.isActive) {
    throw new ForbiddenError("This admin account has been deactivated");
  }

  const updated = await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { lastLogin: new Date() },
    select: adminProfileSelect,
  });

  return {
    admin: updated as AdminProfile,
    session: signAdminToken(admin.id, admin.tokenVersion),
  };
}

// ---------------------------------------------------------------------------
// Current admin
// ---------------------------------------------------------------------------

export async function getCurrentAdmin(adminId: string): Promise<AdminProfile> {
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
    select: adminProfileSelect,
  });

  if (!admin) {
    throw new NotFoundError("Admin not found");
  }

  return admin as AdminProfile;
}

// ---------------------------------------------------------------------------
// Logout — tokens are stateless (no refresh token, nothing stored per token),
// so the only way to end a session is to bump tokenVersion, which also ends any
// other admin token still in circulation.
// ---------------------------------------------------------------------------

export async function logout(adminId: string): Promise<void> {
  await prisma.platformAdmin.update({
    where: { id: adminId },
    data: { tokenVersion: { increment: 1 } },
  });
}

// ---------------------------------------------------------------------------
// Change password — ends every other session; this one continues with a new
// token carrying the bumped tokenVersion.
// ---------------------------------------------------------------------------

export async function changePassword(
  adminId: string,
  input: AdminChangePasswordInput
): Promise<AdminSession> {
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
    select: { id: true, passwordHash: true, isActive: true },
  });

  if (!admin) {
    throw new NotFoundError("Admin not found");
  }

  if (!admin.isActive) {
    throw new ForbiddenError("This admin account has been deactivated");
  }

  const currentOk = await bcrypt.compare(
    input.currentPassword,
    admin.passwordHash
  );
  if (!currentOk) {
    throw new UnauthorizedError("Current password is incorrect");
  }

  const newPasswordHash = await bcrypt.hash(
    input.newPassword,
    config.bcrypt.saltRounds
  );

  const updated = await prisma.platformAdmin.update({
    where: { id: adminId },
    data: { passwordHash: newPasswordHash, tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });

  return signAdminToken(adminId, updated.tokenVersion);
}
