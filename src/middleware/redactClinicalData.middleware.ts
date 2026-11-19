// src/middleware/redactClinicalData.middleware.ts
//
// Reception does not need (and must not see) what the doctor decided:
// diagnosis, treatment and prescription. Rather than trusting every select in
// every service to remember that, this middleware strips those keys from the
// JSON body of every response sent to a RECEPTIONIST. Mount it right after
// authMiddleware on any router that can return visit data.

import type { NextFunction, Request, Response } from "express";

export const CLINICAL_FIELDS: ReadonlySet<string> = new Set([
  "diagnosis",
  "treatment",
  "prescription",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Deep copy of `value` without the clinical fields. Dates etc. pass through. */
export function stripClinicalFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripClinicalFields(item)) as unknown as T;
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (CLINICAL_FIELDS.has(key)) continue;
      out[key] = stripClinicalFields(inner);
    }
    return out as T;
  }

  return value;
}

const INSTALLED = "clinicalRedactionInstalled";

export function redactClinicalDataForReception(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.role !== "RECEPTIONIST" || res.locals[INSTALLED]) {
    next();
    return;
  }

  res.locals[INSTALLED] = true;
  const originalJson = res.json.bind(res);
  res.json = ((body?: unknown) =>
    originalJson(stripClinicalFields(body))) as Response["json"];

  next();
}
