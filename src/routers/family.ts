import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const familyRouter = router({
  getMembers: protectedProcedure
    .input(
      z.object({
        familyId: z.number(),
      })
    )
    .query(async (opts) => {
      const members = await opts.ctx.prisma.patient.findMany({
        where: { familyId: opts.input.familyId },
        include: { addresses: true },
      });

      return {
        familyId: opts.input.familyId,
        members,
      };
    }),

  linkMember: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        familyId: z.number(),
      })
    )
    .mutation(async (opts) => {
      const patient = await opts.ctx.prisma.patient.findUnique({
        where: { patientId: opts.input.patientId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const family = await opts.ctx.prisma.patient.findUnique({
        where: { patientId: opts.input.familyId },
      });

      if (!family || family.patientType !== 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid family head',
        });
      }

      const updatedPatient = await opts.ctx.prisma.patient.update({
        where: { patientId: opts.input.patientId },
        data: {
          familyId: opts.input.familyId,
          patientType: 2,
        },
      });

      return {
        success: true,
        patient: updatedPatient,
      };
    }),

  unlinkMember: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
      })
    )
    .mutation(async (opts) => {
      const patient = await opts.ctx.prisma.patient.findUnique({
        where: { patientId: opts.input.patientId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const updatedPatient = await opts.ctx.prisma.patient.update({
        where: { patientId: opts.input.patientId },
        data: {
          familyId: opts.input.patientId,
          patientType: 1,
        },
      });

      return {
        success: true,
        patient: updatedPatient,
      };
    }),
});
