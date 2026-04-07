/**
 * Appointment Router
 *
 * Manages appointment scheduling, waiting room, and appointment types.
 * Original MFC: CAppointmentSet, CWaitRoomSet, AppointmentDlg
 */

import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import * as crypto from 'crypto';
import { TRPCError } from '@trpc/server';

export const appointmentRouter = router({
  /**
   * Paginated list of appointments with filters
   */
  list: protectedProcedure
    .input(
      z.object({
        skip: z.number().default(0),
        take: z.number().default(20),
        patientId: z.number().int().optional(),
        dentistId: z.number().int().optional(),
        fromDate: z.coerce.date().optional(),
        toDate: z.coerce.date().optional(),
        status: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = {};
      if (input.patientId) where.patientId = input.patientId;
      if (input.dentistId) where.dentistId = input.dentistId;
      if (input.status !== undefined) where.status = input.status;
      if (input.fromDate || input.toDate) {
        where.date = {};
        if (input.fromDate) where.date.gte = input.fromDate;
        if (input.toDate) where.date.lte = input.toDate;
      }

      const [appointments, total] = await Promise.all([
        ctx.prisma.appointment.findMany({
          where,
          include: {
            patient: { 
              select: { 
                patientId: true, 
                firstName: true, 
                lastName: true, 
                phone: true,
                email: true,
                addresses: { select: { cellular: true, phone: true } }
              } 
            },
            newPatient: { select: { newPatientId: true, firstName: true, lastName: true, phone: true } },
            dentist: { select: { dentistId: true, name: true } },
            appointmentType: true,
          },
          orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
          skip: input.skip,
          take: input.take,
        }),
        ctx.prisma.appointment.count({ where }),
      ]);

      return { appointments, total };
    }),

  /**
   * Get appointments for a specific date (day view)
   */
  getByDate: protectedProcedure
    .input(
      z.object({
        date: z.coerce.date(),
        dentistId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Match the entire day
      const startOfDay = new Date(input.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(input.date);
      endOfDay.setHours(23, 59, 59, 999);

      const where: any = {
        date: { gte: startOfDay, lte: endOfDay },
      };
      if (input.dentistId) where.dentistId = input.dentistId;

      return ctx.prisma.appointment.findMany({
        where,
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true, phone: true } },
          newPatient: { select: { newPatientId: true, firstName: true, lastName: true, phone: true } },
          dentist: { select: { dentistId: true, name: true } },
          appointmentType: true,
        },
        orderBy: { startTime: 'asc' },
      });
    }),

  /**
   * Get appointments for a specific patient
   */
  getByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        skip: z.number().default(0),
        take: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const [appointments, total] = await Promise.all([
        ctx.prisma.appointment.findMany({
          where: { patientId: input.patientId },
          include: {
            dentist: { select: { dentistId: true, name: true } },
            appointmentType: true,
            patient: { 
              select: { 
                email: true, 
                firstName: true,
                addresses: { select: { cellular: true, phone: true } }
              } 
            }
          },
          orderBy: { date: 'desc' },
          skip: input.skip,
          take: input.take,
        }),
        ctx.prisma.appointment.count({ where: { patientId: input.patientId } }),
      ]);
      return { appointments, total };
    }),

  /**
   * Create a new appointment
   */
  create: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int().optional(),
        newPatientId: z.number().int().optional(),
        dentistId: z.number().int(),
        appointmentTypeId: z.number().int().optional(),
        roomId: z.number().int().optional(),
        date: z.coerce.date(),
        startTime: z.coerce.date().optional(),
        endTime: z.coerce.date().optional(),
        duration: z.number().int().optional(),
        notes: z.string().optional(),
        status: z.number().int().default(0), // 0=scheduled
        forceCreate: z.boolean().default(false), // bypass conflict check
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { forceCreate, ...data } = input;
      // Server-side conflict check — skip if forceCreate is true
      if (!forceCreate && data.startTime && data.endTime) {
        const startOfDay = new Date(input.date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(input.date);
        endOfDay.setHours(23, 59, 59, 999);

        const conflicts = await ctx.prisma.appointment.findMany({
          where: {
            OR: [
              { dentistId: input.dentistId },
              ...(input.roomId ? [{ roomId: input.roomId }] : [])
            ],
            date: { gte: startOfDay, lte: endOfDay },
            startTime: { lt: input.endTime },
            endTime: { gt: input.startTime },
            status: { notIn: [3, 4] },
          },
        });

        if (conflicts.length > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Time slot conflicts with ${conflicts.length} existing appointment(s) for this dentist or room. Use checkConflicts to review, then retry with confirmation.`,
          });
        }
      }

      return ctx.prisma.appointment.create({
        data,
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true } },
          newPatient: { select: { newPatientId: true, firstName: true, lastName: true, phone: true } },
          dentist: { select: { dentistId: true, name: true } },
          room: { select: { roomId: true, name: true, colorCode: true } },
          appointmentType: true,
        },
      });
    }),

  /**
   * Update an appointment
   */
  update: protectedProcedure
    .input(
      z.object({
        appointmentId: z.number().int(),
        patientId: z.number().int().nullable().optional(),
        newPatientId: z.number().int().nullable().optional(),
        dentistId: z.number().int().optional(),
        appointmentTypeId: z.number().int().nullable().optional(),
        roomId: z.number().int().nullable().optional(),
        date: z.coerce.date().optional(),
        startTime: z.coerce.date().nullable().optional(),
        endTime: z.coerce.date().nullable().optional(),
        duration: z.number().int().nullable().optional(),
        notes: z.string().nullable().optional(),
        status: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { appointmentId, ...data } = input;
      return ctx.prisma.appointment.update({
        where: { appointmentId },
        data,
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true } },
          dentist: { select: { dentistId: true, name: true } },
          room: { select: { roomId: true, name: true, colorCode: true } },
          appointmentType: true,
        },
      });
    }),

  /**
   * Delete an appointment
   */
  delete: protectedProcedure
    .input(z.object({ appointmentId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.appointment.delete({
        where: { appointmentId: input.appointmentId },
      });
    }),

  /**
   * Get waiting room — today's appointments with certain statuses
   * Status 1 = arrived/waiting, Status 2 = in treatment
   */
  getWaitingRoom: protectedProcedure
    .input(
      z.object({
        date: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx }) => {
      // Drop date enforcement: If an appointment has status 1 or 2, they are physically in the clinic.
      return ctx.prisma.appointment.findMany({
        where: {
          status: { in: [1, 2] }, // arrived or in-treatment
        },
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true, phone: true } },
          newPatient: { select: { newPatientId: true, firstName: true, lastName: true, phone: true } },
          dentist: { select: { dentistId: true, name: true } },
          appointmentType: true,
        },
        orderBy: { startTime: 'asc' },
      });
    }),

  /**
   * Get appointments for a date range (week/month views)
   */
  getByRange: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        dentistId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const start = new Date(input.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(input.endDate);
      end.setHours(23, 59, 59, 999);

      const where: any = {
        date: { gte: start, lte: end },
      };
      if (input.dentistId) where.dentistId = input.dentistId;

      return ctx.prisma.appointment.findMany({
        where,
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true, phone: true } },
          newPatient: { select: { newPatientId: true, firstName: true, lastName: true, phone: true } },
          dentist: { select: { dentistId: true, name: true } },
          appointmentType: true,
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    }),

  /**
   * Check for scheduling conflicts before creating/updating an appointment.
   * Returns overlapping appointments for the same dentist in the given time window.
   * Also checks for patient double-booking (same patient, overlapping time, different dentist).
   */
  checkConflicts: protectedProcedure
    .input(
      z.object({
        dentistId: z.number().int(),
        date: z.coerce.date(),
        startTime: z.coerce.date(),
        endTime: z.coerce.date(),
        patientId: z.number().int().optional(),
        excludeAppointmentId: z.number().int().optional(), // for updates
      })
    )
    .query(async ({ ctx, input }) => {
      const startOfDay = new Date(input.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(input.date);
      endOfDay.setHours(23, 59, 59, 999);

      const excludeId = input.excludeAppointmentId;

      // Find dentist conflicts: same dentist, overlapping time
      const dentistConflicts = await ctx.prisma.appointment.findMany({
        where: {
          dentistId: input.dentistId,
          date: { gte: startOfDay, lte: endOfDay },
          startTime: { lt: input.endTime },
          endTime: { gt: input.startTime },
          ...(excludeId ? { appointmentId: { not: excludeId } } : {}),
          status: { notIn: [3, 4] }, // exclude cancelled (3) and no-show (4)
        },
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true } },
          dentist: { select: { dentistId: true, name: true } },
          appointmentType: true,
        },
        orderBy: { startTime: 'asc' },
      });

      // Find patient conflicts: same patient, overlapping time, any dentist
      let patientConflicts: typeof dentistConflicts = [];
      if (input.patientId) {
        patientConflicts = await ctx.prisma.appointment.findMany({
          where: {
            patientId: input.patientId,
            date: { gte: startOfDay, lte: endOfDay },
            startTime: { lt: input.endTime },
            endTime: { gt: input.startTime },
            ...(excludeId ? { appointmentId: { not: excludeId } } : {}),
            status: { notIn: [3, 4] },
          },
          include: {
            patient: { select: { patientId: true, firstName: true, lastName: true } },
            dentist: { select: { dentistId: true, name: true } },
            appointmentType: true,
          },
          orderBy: { startTime: 'asc' },
        });
      }

      return {
        hasConflicts: dentistConflicts.length > 0 || patientConflicts.length > 0,
        dentistConflicts,
        patientConflicts,
      };
    }),

  /**
   * Get appointment types (lookup)
   */
  getTypes: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.appointmentType.findMany({
      orderBy: { name: 'asc' },
    });
  }),

  // -- QR Code Scanning & Public Linking --

  /**
   * Public endpoint allowing patients to see their appointment pass
   * using a unique secure token (UUID).
   */
  getPublicDetailsByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const appointment: any = await (ctx.prisma.appointment as any).findFirst({
        where: { token: input.token },
        include: {
          patient: { select: { firstName: true, lastName: true, email: true } },
          dentist: { select: { name: true } },
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found or link is invalid.',
        });
      }

      return appointment;
    }),

  /**
   * Protected endpoint for clinic staff.
   * Scans a token, marks the appointment status as "Waiting" (status = 1),
   * and returns the patientId to trigger the dashboard view.
   */
  scanAndCheckIn: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // If the token is short (e.g. 8 chars), we treat it as a PIN and do a startswith query
      const isPin = input.token.length <= 8;
      
      const appointment: any = await (ctx.prisma.appointment as any).findFirst({
        where: isPin ? { token: { startsWith: input.token } } : { token: input.token },
        select: { appointmentId: true, patientId: true, status: true, token: true }
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invalid QR Pass.',
        });
      }

      if (!appointment.patientId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This appointment is not linked to a registered patient profile.',
        });
      }

      const updated = await ctx.prisma.appointment.update({
        where: { appointmentId: appointment.appointmentId },
        data: { status: 1 }, // 1 = Waiting Room status
      });

      // Also ensure they are in the waiting room table
      const inWaitingRoom = await ctx.prisma.waitingRoom.findFirst({
        where: { appointmentId: updated.appointmentId }
      });

      if (!inWaitingRoom) {
        await ctx.prisma.waitingRoom.create({
          data: {
            patientId: appointment.patientId,
            newPatientId: appointment.newPatientId,
            appointmentId: updated.appointmentId,
            memo: 'Checked in via QR Scanner',
            arrivalTime: new Date(),
          }
        });
      }

      return {
        success: true,
        patientId: appointment.patientId,
        appointmentId: updated.appointmentId,
      };
    }),

  /**
   * Revoke existing appointment link token by scrambling it.
   */
  revokePass: protectedProcedure
    .input(z.object({ appointmentId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.appointment.update({
        where: { appointmentId: input.appointmentId },
        data: { token: crypto.randomUUID() },
      });
      return updated;
    }),
});
