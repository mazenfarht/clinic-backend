// src/modules/admin/auth/admin-auth.types.ts

export interface JwtAdminPayload {
  sub: string;
  // PlatformAdmin.tokenVersion at issue time; a mismatch means the token was
  // revoked (logout, password change, deactivation).
  tv: number;
  type: "admin";
}

// What the admin middleware attaches to the request (always read from the
// database, never trusted from the token).
export interface RequestAdmin {
  id: string;
  email: string;
  fullName: string;
}

export interface AdminProfile {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminSession {
  accessToken: string;
  // ISO time at which accessToken stops working (there is no refresh token)
  expiresAt: string;
}

export interface AdminLoginResult {
  admin: AdminProfile;
  session: AdminSession;
}

declare global {
  namespace Express {
    interface Request {
      // Deliberately NOT `req.user`: that property belongs to clinic users, so
      // a clinic route can never mistake an admin for a user or the reverse.
      admin?: RequestAdmin;
    }
  }
}
