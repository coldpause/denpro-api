/**
 * Disease & Patient Disease Router
 *
 * Manages the global disease list (lookup table) and per-patient disease tracking.
 * Original MFC: CDiseaseListSet, CPatientDiseaseSet
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const diseaseRouter = router({
  /**
   * List all diseases (global lookup)
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.disease.findMany({
      orderBy: [
        { disSortOrder: 'asc' },
        { name: 'asc' },
      ],
    });
  }),

  /**
   * Create a new disease entry in the global list
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        disSortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate name
      const existing = await ctx.prisma.disease.findFirst({
        where: { name: { equals: input.name, mode: 'insensitive' } },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Disease "${input.name}" already exists`,
        });
      }
      return ctx.prisma.disease.create({ data: input });
    }),

  /**
   * Update a disease name/sort order
   */
  update: adminProcedure
    .input(
      z.object({
        diseaseId: z.number().int(),
        name: z.string().min(1).optional(),
        disSortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { diseaseId, ...data } = input;
      return ctx.prisma.disease.update({
        where: { diseaseId },
        data,
      });
    }),

  /**
   * Delete a disease from the global list
   * Only allowed if no patients reference it
   */
  delete: adminProcedure
    .input(z.object({ diseaseId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.prisma.patientDisease.count({
        where: { diseaseId: input.diseaseId },
      });
      if (count > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete: ${count} patient(s) have this disease recorded`,
        });
      }
      return ctx.prisma.disease.delete({ where: { diseaseId: input.diseaseId } });
    }),

  /**
   * Get diseases for a specific patient
   */
  getByPatient: protectedProcedure
    .input(z.object({ patientId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.patientDisease.findMany({
        where: { patientId: input.patientId },
        include: { disease: true },
        orderBy: { patientDiseaseId: 'asc' },
      });
    }),

  /**
   * Add a disease to a patient's record
   */
  addToPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        diseaseId: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate
      const existing = await ctx.prisma.patientDisease.findFirst({
        where: {
          patientId: input.patientId,
          diseaseId: input.diseaseId,
        },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This disease is already recorded for the patient',
        });
      }
      return ctx.prisma.patientDisease.create({
        data: input,
        include: { disease: true },
      });
    }),

  /**
   * Remove a disease from a patient's record
   */
  removeFromPatient: protectedProcedure
    .input(z.object({ patientDiseaseId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.patientDisease.delete({
        where: { patientDiseaseId: input.patientDiseaseId },
      });
    }),
});
