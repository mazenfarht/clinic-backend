// src/modules/admin/stats/admin-stats.controller.ts

import type { Request, Response } from "express";
import * as AdminStatsService from "./admin-stats.service";
import { ApiResponse } from "../../../shared/utils/apiResponse";
import asyncHandler from "../../../shared/utils/asyncHandler";

// GET /admin/stats
export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await AdminStatsService.getPlatformStats();

  ApiResponse.ok(res, stats, "Platform stats retrieved successfully");
});
