// src/modules/admin/index.ts

export { default } from "./admin.routes";

export * from "./auth/admin-auth.types";
export * from "./auth/admin-auth.validation";
export { adminAuthMiddleware } from "./auth/admin-auth.middleware";
export * as AdminAuthService from "./auth/admin-auth.service";
