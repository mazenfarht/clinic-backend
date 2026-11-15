// src/modules/admin/auth/admin-auth.validation.ts

import { z } from "zod";
import { passwordComplexitySchema } from "../../auth/auth.validation";

export const adminLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Invalid email"),
  // No complexity rules on login: they would reveal the password policy and
  // are meaningless here. The upper bound keeps bcrypt work bounded.
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password is too long"),
});

export const adminChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    // bcrypt silently ignores everything after 72 bytes, so refuse longer ones
    newPassword: passwordComplexitySchema.max(
      72,
      "Password must not exceed 72 characters"
    ),
    confirmPassword: z.string().min(1, "Password confirmation is required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminChangePasswordInput = z.infer<
  typeof adminChangePasswordSchema
>;
