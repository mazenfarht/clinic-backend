// src/modules/appointments/appointment.controller.ts

import type { Request, Response } from "express";
import * as AppointmentService from "./appointment.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import { AppError, HttpStatus } from "../../shared/errors/AppError";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  appointmentQuerySchema,
  appointmentIdSchema,
} from "./appointment.validation";
import {
  resolveDoctorId,
  assertAppointmentAccess,
} from "../doctors/doctor-scope";

// ---------------------------------------------------------------------------
// Resolve authenticated clinic and user from token
// ---------------------------------------------------------------------------

function resolveAuth(req: Request): { clinicId: string; userId: string } {
  if (!req.user) {
    throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  }
  return { clinicId: req.user.clinicId, userId: req.user.sub };
}

// ---------------------------------------------------------------------------
// POST /appointments
// ---------------------------------------------------------------------------

export const createAppointment = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const input = createAppointmentSchema.parse(req.body);
    // DOCTOR logins can only book into their own schedule
    await resolveDoctorId(req, input.doctorId);
    const appointment = await AppointmentService.createAppointment(
      clinicId,
      userId,
      input
    );

    ApiResponse.created(res, appointment, "Appointment created successfully");
  }
);

// ---------------------------------------------------------------------------
// GET /appointments
// ---------------------------------------------------------------------------

export const listAppointments = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const filters = appointmentQuerySchema.parse(req.query);
    // DOCTOR -> forced to their own appointments; RECEPTIONIST -> all (or ?doctorId=)
    const doctorId = await resolveDoctorId(req, filters.doctorId);
    const result = await AppointmentService.listAppointments(clinicId, {
      ...filters,
      doctorId,
    });

    ApiResponse.paginated(
      res,
      result.appointments,
      result.meta,
      "Appointments retrieved successfully"
    );
  }
);

// ---------------------------------------------------------------------------
// GET /appointments/:id
// ---------------------------------------------------------------------------

export const getAppointmentById = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const { id } = appointmentIdSchema.parse(req.params);
    await assertAppointmentAccess(req, id);
    const appointment = await AppointmentService.getAppointmentById(
      id,
      clinicId
    );

    ApiResponse.ok(res, appointment, "Appointment retrieved successfully");
  }
);

// ---------------------------------------------------------------------------
// PATCH /appointments/:id
// ---------------------------------------------------------------------------

export const updateAppointment = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = appointmentIdSchema.parse(req.params);
    await assertAppointmentAccess(req, id);
    const input = updateAppointmentSchema.parse(req.body);
    // Only reception can move an appointment to a different doctor
    await resolveDoctorId(req, input.doctorId);
    const appointment = await AppointmentService.updateAppointment(
      id,
      clinicId,
      userId,
      input
    );

    ApiResponse.ok(res, appointment, "Appointment updated successfully");
  }
);

// ---------------------------------------------------------------------------
// PATCH /appointments/:id/confirm
// ---------------------------------------------------------------------------

export const confirmAppointment = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = appointmentIdSchema.parse(req.params);
    await assertAppointmentAccess(req, id);
    const appointment = await AppointmentService.confirmAppointment(
      id,
      clinicId,
      userId
    );

    ApiResponse.ok(res, appointment, "Appointment confirmed successfully");
  }
);

// ---------------------------------------------------------------------------
// PATCH /appointments/:id/cancel
// ---------------------------------------------------------------------------

export const cancelAppointment = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = appointmentIdSchema.parse(req.params);
    await assertAppointmentAccess(req, id);
    const appointment = await AppointmentService.cancelAppointment(
      id,
      clinicId,
      userId
    );

    ApiResponse.ok(res, appointment, "Appointment cancelled successfully");
  }
);

// ---------------------------------------------------------------------------
// PATCH /appointments/:id/complete
// ---------------------------------------------------------------------------

export const completeAppointment = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = appointmentIdSchema.parse(req.params);
    await assertAppointmentAccess(req, id);
    const appointment = await AppointmentService.completeAppointment(
      id,
      clinicId,
      userId
    );

    ApiResponse.ok(res, appointment, "Appointment completed successfully");
  }
);

// ---------------------------------------------------------------------------
// PATCH /appointments/:id/no-show
// ---------------------------------------------------------------------------

export const noShowAppointment = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = appointmentIdSchema.parse(req.params);
    await assertAppointmentAccess(req, id);
    const appointment = await AppointmentService.noShowAppointment(
      id,
      clinicId,
      userId
    );

    ApiResponse.ok(
      res,
      appointment,
      "Appointment marked as no-show successfully"
    );
  }
);
