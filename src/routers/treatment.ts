/**
 * Treatment Router
 *
 * Manages treatment records — each treatment links a patient + operation + tooth(s) + dentist.
 * Original MFC: CTreatmentSet, CTreatmentListView
 */

import { z } from 'zod';
import { router, protectedProcedure, dentistProcedure } from '../trpc';
import { createAuditMiddleware } from '../middleware/audit';

const auditedDentistProcedure = dentistProcedure.use(createAuditMiddleware('Treatment'));
import { TRPCError } from '@trpc/server';
import type { ApiTreatment } from '../shared';

export const treatmentRouter = router({
  /**
   * Paginated list of all treatments (admin view)
   */
  list: protectedProcedure
    .input(
      z.object({
        skip: z.number().default(0),
        take: z.number().default(20),
        patientId: z.number().int().optional(),
        dentistId: z.number().int().optional(),
        procStatusId: z.number().int().optional(),
        fromDate: z.coerce.date().optional(),
        toDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = {};
      if (input.patientId) where.patientId = input.patientId;
      if (input.dentistId) where.dentistId = input.dentistId;
      if (input.procStatusId) where.procStatusId = input.procStatusId;
      if (input.fromDate || input.toDate) {
        where.dateTime = {};
        if (input.fromDate) where.dateTime.gte = input.fromDate;
        if (input.toDate) where.dateTime.lte = input.toDate;
      }

      const [treatments, total] = await Promise.all([
        ctx.prisma.treatment.findMany({
          where,
          include: {
            patient: { select: { patientId: true, firstName: true, lastName: true } },
            operation: { select: { operationId: true, name: true } },
            dentist: { select: { dentistId: true, name: true } },
            procStatus: true,
          },
          orderBy: { dateTime: 'desc' },
          skip: input.skip,
          take: input.take,
        }),
        ctx.prisma.treatment.count({ where }),
      ]);

      return { treatments: treatments as unknown as ApiTreatment[], total };
    }),

  /**
   * Get treatments for a specific patient
   */
  getByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        skip: z.number().default(0),
        take: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const [treatments, total] = await Promise.all([
        ctx.prisma.treatment.findMany({
          where: { patientId: input.patientId },
          include: {
            operation: { select: { operationId: true, name: true } },
            dentist: { select: { dentistId: true, name: true } },
            procStatus: true,
          },
          orderBy: { dateTime: 'desc' },
          skip: input.skip,
          take: input.take,
        }),
        ctx.prisma.treatment.count({ where: { patientId: input.patientId } }),
      ]);
      return { treatments: treatments as unknown as ApiTreatment[], total };
    }),

  /**
   * Get a single treatment by ID
   */
  getById: protectedProcedure
    .input(z.object({ treatmentId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const treatment = await ctx.prisma.treatment.findUnique({
        where: { treatmentId: input.treatmentId },
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true } },
          operation: true,
          dentist: true,
          procStatus: true,
          distributions: true,
        },
      });
      if (!treatment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Treatment not found' });
      }
      return treatment as unknown as ApiTreatment;
    }),

  /**
   * Create a new treatment
   */
  create: auditedDentistProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        operationId: z.number().int(),
        dentistId: z.number().int().optional(),
        toothId: z.number().int().optional(),
        tooth2Id: z.number().int().optional(),
        surfaces: z.string().optional(), // e.g. "MOD", "B", "BL"
        procStatusId: z.number().int().default(3), // default: Planned
        dateTime: z.coerce.date(),
        netPrice: z.number().default(0),
        foreignNetPrice: z.number().optional(),
        exchangeRate: z.number().optional(),
        plan: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.treatment.create({
        data: {
          ...input,
          netPrice: input.netPrice,
          dentistId: input.dentistId ?? null,
        },
        include: {
          operation: { select: { operationId: true, name: true } },
          procStatus: true,
        },
      });
      return result as unknown as ApiTreatment;
    }),

  /**
   * Update an existing treatment
   */
  update: auditedDentistProcedure
    .input(
      z.object({
        treatmentId: z.number().int(),
        operationId: z.number().int().optional(),
        dentistId: z.number().int().nullable().optional(),
        toothId: z.number().int().nullable().optional(),
        tooth2Id: z.number().int().nullable().optional(),
        surfaces: z.string().nullable().optional(),
        procStatusId: z.number().int().optional(),
        dateTime: z.coerce.date().optional(),
        netPrice: z.number().optional(),
        foreignNetPrice: z.number().nullable().optional(),
        exchangeRate: z.number().nullable().optional(),
        plan: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { treatmentId, ...data } = input;
      const result = await ctx.prisma.treatment.update({
        where: { treatmentId },
        data,
        include: {
          operation: { select: { operationId: true, name: true } },
          procStatus: true,
        },
      });
      return result as unknown as ApiTreatment;
    }),

  /**
   * Get treatments for a specific tooth of a patient (tooth history timeline)
   */
  getByTooth: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        toothId: z.number().int(),
      })
    )
    .query(async ({ ctx, input }) => {
      const treatments = await ctx.prisma.treatment.findMany({
        where: {
          patientId: input.patientId,
          OR: [
            { toothId: input.toothId },
            { tooth2Id: input.toothId },
          ],
        },
        include: {
          operation: { select: { operationId: true, name: true } },
          dentist: { select: { dentistId: true, name: true } },
          procStatus: true,
        },
        orderBy: { dateTime: 'desc' },
      });
      return treatments as unknown as ApiTreatment[];
    }),

  /**
   * Update just the status (quick action)
   */
  updateStatus: dentistProcedure
    .input(
      z.object({
        treatmentId: z.number().int(),
        procStatusId: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.treatment.update({
        where: { treatmentId: input.treatmentId },
        data: { procStatusId: input.procStatusId },
        include: { procStatus: true },
      });
      return result as unknown as ApiTreatment;
    }),
});
