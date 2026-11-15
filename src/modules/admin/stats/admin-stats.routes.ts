// src/modules/admin/stats/admin-stats.routes.ts

import { Router } from "express";
import * as Controller from "./admin-stats.controller";

const router = Router();

router.get("/", Controller.getStats);

export default router;
