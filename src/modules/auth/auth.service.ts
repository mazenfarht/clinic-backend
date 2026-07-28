// src/modules/auth/auth.service.ts

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../config/database";
import config from "../../config";
import {
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
} from "../../shared/errors/AppError";
import type {
  AuthTokens,
  AuthenticatedUser,
  LoginResult,
  JwtAccessPayload,
  JwtRefreshPayload,
} from "./auth.types";
import type { LoginInput, ChangePasswordInput } from "./auth.validation";

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

function generateAccessToken(payload: Omit<JwtAccessPayload, "type">): string {
  return jwt.sign(
    { ...payload, type: "access" } satisfies JwtAccessPayload,
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );
}

function generateRefreshToken(
  payload: Omit<JwtRefreshPayload, "type">
): string {
  return jwt.sign(
    { ...payload, type: "refresh" } satisfies JwtRefreshPayload,
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions
  );
}

function generateTokenPair(
  userId: string,
  clinicId: string,
  role: AuthenticatedUser["role"]
): AuthTokens {
  const accessToken = generateAccessToken({ sub: userId, clinicId, role });
  const refreshToken = generateRefreshToken({ sub: userId, clinicId });
  return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// User selector — never return passwordHash to callers
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
// Login
// ---------------------------------------------------------------------------

export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findFirst({
    where: {
      email: input.email,
      clinic: { isActive: true },
    },
    select: {
      ...userPublicSelect,
      passwordHash: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!user.isActive) {
    throw new ForbiddenError(
      "Your account has been deactivated. Please contact your administrator"
    );
  }

  const isPasswordValid = await bcrypt.compare(
    input.password,
    user.passwordHash
  );

  if (!isPasswordValid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const tokens = generateTokenPair(user.id, user.clinicId, user.role);

  const { passwordHash: _, ...publicUser } = user;

  return {
    user: publicUser as AuthenticatedUser,
    tokens,
  };
}

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

export async function refreshTokens(token: string): Promise<AuthTokens> {
  let payload: JwtRefreshPayload;

  try {
    payload = jwt.verify(token, config.jwt.refreshSecret) as JwtRefreshPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (payload.type !== "refresh") {
    throw new UnauthorizedError("Invalid token type");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: userPublicSelect,
  });

  if (!user) {
    throw new UnauthorizedError("User no longer exists");
  }

  if (!user.isActive) {
    throw new ForbiddenError("Your account has been deactivated");
  }

  return generateTokenPair(user.id, user.clinicId, user.role);
}

// ---------------------------------------------------------------------------
// Get current authenticated user
// ---------------------------------------------------------------------------

export async function getCurrentUser(
  userId: string
): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userPublicSelect,
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (!user.isActive) {
    throw new ForbiddenError("Your account has been deactivated");
  }

  return user as AuthenticatedUser;
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

export async function changePassword(
  userId: string,
  input: ChangePasswordInput
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, isActive: true },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (!user.isActive) {
    throw new ForbiddenError("Your account has been deactivated");
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    input.currentPassword,
    user.passwordHash
  );

  if (!isCurrentPasswordValid) {
    throw new UnauthorizedError("Current password is incorrect");
  }

  const newPasswordHash = await bcrypt.hash(
    input.newPassword,
    config.bcrypt.saltRounds
  );

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newPasswordHash },
  });
}
