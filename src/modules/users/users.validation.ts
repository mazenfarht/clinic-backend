// src/modules/users/users.validation.ts

import { z } from "zod";
import { passwordComplexitySchema } from "../auth/auth.validation";

// ---------------------------------------------------------------------------
// POST /users/receptionist
// ---------------------------------------------------------------------------

export const createReceptionistSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),

  password: passwordComplexitySchema,

  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be at most 100 characters")
    .trim(),
});

export type CreateReceptionistInput = z.infer<typeof createReceptionistSchema>;
