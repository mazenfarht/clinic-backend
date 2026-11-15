// src/modules/admin/admin.routes.ts
//
// Everything under /api/v1/admin — the platform (super admin) API. It is a
// separate world from the clinic API: own table, own token secret, own
// middleware. Only /auth/login is public; every other route here requires a
// valid admin token.

import { Router } from "express";
import adminAuthRoutes from "./auth/admin-auth.routes";
import { adminAuthMiddleware } from "./auth/admin-auth.middleware";
import adminClinicsRoutes from "./clinics/admin-clinics.routes";
import adminStatsRoutes from "./stats/admin-stats.routes";

const router = Router();

// Login is public; the other auth routes protect themselves.
router.use("/auth", adminAuthRoutes);

router.use("/clinics", adminAuthMiddleware, adminClinicsRoutes);
router.use("/stats", adminAuthMiddleware, adminStatsRoutes);

export default router;
