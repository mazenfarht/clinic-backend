// src/modules/auth/auth.types.ts

import type { Role } from "@prisma/client";

export interface JwtAccessPayload {
  sub: string;
  clinicId: string;
  role: Role;
  type: "access";
}

export interface JwtRefreshPayload {
  sub: string;
  clinicId: string;
  type: "refresh";
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
