// src/modules/auth/auth.types.ts

import type { Role } from "@prisma/client";

export interface JwtAccessPayload {
  sub: string;
  clinicId: string;
  role: Role;
  // User.tokenVersion at issue time; a mismatch means the token was revoked
  tv: number;
  type: "access";
}

export interface JwtRefreshPayload {
  sub: string;
  clinicId: string;
  // RefreshToken row id (set through the standard `jti` claim)
  jti: string;
  type: "refresh";
}

// Request metadata stored next to each refresh token
export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  clinicId: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginResult {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtAccessPayload;
    }
  }
}
