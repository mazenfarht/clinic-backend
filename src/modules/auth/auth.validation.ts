// src/modules/auth/auth.validation.ts

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared password complexity rule — reused by changePasswordSchema and the
// users module (createReceptionistSchema) so the rules live in one place.
// ---------------------------------------------------------------------------

export const passwordComplexitySchema = z
  .string()
  .min(1, "Password is required")
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character"
  );

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email"),

  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),

  // Only needed when the same email exists in more than one clinic
  clinicId: z.string().uuid("Invalid clinic ID format").optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// POST /auth/logout — revoke one session (refreshToken) or all of them
export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
    allDevices: z.boolean().optional(),
  })
  .refine((d) => d.refreshToken || d.allDevices, {
    message: "Provide refreshToken, or set allDevices to true",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),

    newPassword: passwordComplexitySchema,

    confirmPassword: z.string().min(1, "Password confirmation is required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
