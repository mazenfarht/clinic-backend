// src/modules/auth/auth.service.ts

import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Prisma, Role } from "@prisma/client";
import prisma from "../../config/database";
import config from "../../config";
import {
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../../shared/errors/AppError";
import type {
  AuthTokens,
  AuthenticatedUser,
  LoginResult,
  JwtAccessPayload,
  JwtRefreshPayload,
  SessionMeta,
} from "./auth.types";
import type {
  LoginInput,
  ChangePasswordInput,
  LogoutInput,
} from "./auth.validation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// A valid bcrypt hash of a random string. Compared against when the email is
// unknown so "no such user" takes as long as "wrong password" (no timing leak).
const DUMMY_PASSWORD_HASH =
  "$2b$12$zimV.bKWyDRNu96ssOHSve3ZjJfVyc8wUZP43Wewzv/jZHgpafc/C";

// A rotated refresh token presented again within this window is treated as a
// harmless double-submit (two tabs refreshing at once). Later reuse means the
// token probably leaked, so every session of that user is revoked.
const REUSE_GRACE_MS = 10_000;

// Thrown inside the rotation transaction when another request already used
// the same refresh token.
class RefreshReuseError extends Error {}

type TokenUser = {
  id: string;
  clinicId: string;
  role: Role;
  tokenVersion: number;
};

type Db = Prisma.TransactionClient | typeof prisma;

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

// Signs a refresh token AND stores its row (the row id is the token's jti), so
// it can be revoked or rotated later.
async function issueTokenPair(
  user: TokenUser,
  meta: SessionMeta,
  db: Db = prisma
): Promise<{ tokens: AuthTokens; refreshTokenId: string }> {
  const refreshTokenId = crypto.randomUUID();

  const refreshToken = jwt.sign(
    { sub: user.id, clinicId: user.clinicId, type: "refresh" },
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshExpiresIn,
      jwtid: refreshTokenId,
    } as jwt.SignOptions
  );

  const { exp } = jwt.decode(refreshToken) as { exp: number };

  await db.refreshToken.create({
    data: {
      id: refreshTokenId,
      userId: user.id,
      expiresAt: new Date(exp * 1000),
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
      ip: meta.ip ?? null,
    },
  });

  const accessToken = generateAccessToken({
    sub: user.id,
    clinicId: user.clinicId,
    role: user.role,
    tv: user.tokenVersion,
  });

  return { tokens: { accessToken, refreshToken }, refreshTokenId };
}

// ---------------------------------------------------------------------------
// Session revocation
// ---------------------------------------------------------------------------

// Ends every session of a user: revokes all refresh tokens and bumps
// tokenVersion so access tokens already in circulation stop working at once.
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ]);
}

// Housekeeping: drop refresh tokens that expired more than a day ago.
function purgeExpiredRefreshTokens(): void {
  void prisma.refreshToken
    .deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    })
    .catch(() => undefined);
}

// Always throws. A token that was already revoked/rotated was presented.
async function rejectRevokedToken(tokenId: string): Promise<never> {
  const row = await prisma.refreshToken.findUnique({ where: { id: tokenId } });

  // Rotated (not logged out) and reused after the grace window -> assume theft.
  if (row?.revokedAt && row.replacedById) {
    if (Date.now() - row.revokedAt.getTime() > REUSE_GRACE_MS) {
      await revokeAllSessions(row.userId);
    }
  }

  throw new UnauthorizedError("Refresh token has been revoked");
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
//
// The same email can exist in several clinics (unique per clinic). Without a
// clinicId we check the password against every match, so the right account is
// picked by its password and an unrelated clinic's account is never used.
// ---------------------------------------------------------------------------

export async function login(
  input: LoginInput,
  meta: SessionMeta = {}
): Promise<LoginResult> {
  const candidates = await prisma.user.findMany({
    where: {
      email: input.email,
      ...(input.clinicId ? { clinicId: input.clinicId } : {}),
      clinic: { isActive: true },
    },
    select: {
      ...userPublicSelect,
      passwordHash: true,
      tokenVersion: true,
    },
    take: 5,
  });

  if (candidates.length === 0) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    throw new UnauthorizedError("Invalid email or password");
  }

  const matches: typeof candidates = [];
  for (const candidate of candidates) {
    if (await bcrypt.compare(input.password, candidate.passwordHash)) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (matches.length > 1) {
    throw new ConflictError(
      "This email is used by more than one clinic. Please provide clinicId."
    );
  }

  const user = matches[0];

  // Checked only AFTER the password, so a deactivated account is not revealed
  // to someone who does not know the password.
  if (!user.isActive) {
    throw new ForbiddenError(
      "Your account has been deactivated. Please contact your administrator"
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const { tokens } = await issueTokenPair(user, meta);

  if (Math.random() < 0.05) purgeExpiredRefreshTokens();

  const { passwordHash: _hash, tokenVersion: _tv, ...publicUser } = user;

  return {
    user: publicUser as AuthenticatedUser,
    tokens,
  };
}

// ---------------------------------------------------------------------------
// Refresh tokens — rotation: every refresh revokes the old token and issues a
// new pair. Re-using an old token is detected (see rejectRevokedToken).
// ---------------------------------------------------------------------------

export async function refreshTokens(
  token: string,
  meta: SessionMeta = {}
): Promise<AuthTokens> {
  let payload: JwtRefreshPayload;

  try {
    payload = jwt.verify(token, config.jwt.refreshSecret) as JwtRefreshPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (payload.type !== "refresh" || !payload.jti) {
    throw new UnauthorizedError("Invalid token type");
  }

  const row = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
  });

  if (!row || row.userId !== payload.sub) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (row.revokedAt) {
    return rejectRevokedToken(row.id);
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: {
      ...userPublicSelect,
      tokenVersion: true,
      clinic: { select: { isActive: true } },
    },
  });

  if (!user) {
    throw new UnauthorizedError("User no longer exists");
  }

  if (!user.clinic.isActive) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (!user.isActive) {
    await revokeAllSessions(user.id);
    throw new ForbiddenError("Your account has been deactivated");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const issued = await issueTokenPair(user, meta, tx);

      // Only one request can flip revokedAt from null -> now.
      const revoked = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: issued.refreshTokenId },
      });

      if (revoked.count === 0) {
        throw new RefreshReuseError();
      }

      return issued.tokens;
    });
  } catch (err) {
    if (err instanceof RefreshReuseError) {
      return rejectRevokedToken(row.id);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Logout — revoke this session's refresh token, or every session
// ---------------------------------------------------------------------------

export async function logout(
  userId: string,
  input: LogoutInput
): Promise<void> {
  if (input.allDevices) {
    await revokeAllSessions(userId);
    return;
  }

  if (!input.refreshToken) return;

  let payload: JwtRefreshPayload;

  try {
    // An expired token is fine here: we only need to know which row it is.
    payload = jwt.verify(input.refreshToken, config.jwt.refreshSecret, {
      ignoreExpiration: true,
    }) as JwtRefreshPayload;
  } catch {
    return; // not one of ours — nothing to revoke, logout still "succeeds"
  }

  if (payload.type !== "refresh" || !payload.jti) return;

  await prisma.refreshToken.updateMany({
    where: { id: payload.jti, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
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
// Change password — ends every other session, keeps this one alive by
// returning a fresh token pair.
// ---------------------------------------------------------------------------

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  meta: SessionMeta = {}
): Promise<AuthTokens> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      clinicId: true,
      role: true,
      passwordHash: true,
      isActive: true,
    },
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        tokenVersion: { increment: 1 },
      },
      select: { tokenVersion: true },
    });

    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const { tokens } = await issueTokenPair(
      {
        id: user.id,
        clinicId: user.clinicId,
        role: user.role,
        tokenVersion: updated.tokenVersion,
      },
      meta,
      tx
    );

    return tokens;
  });
}
