/**
 * Dentist Router — manages the dentist/doctor records
 * Original MFC: CDentistSet
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const dentistRouter = router({
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.activeOnly !== false ? { active: true } : {};
      return ctx.prisma.dentist.findMany({
        where,
        include: { division: true },
        orderBy: { name: 'asc' },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ dentistId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const dentist = await ctx.prisma.dentist.findUnique({
        where: { dentistId: input.dentistId },
        include: { division: true },
      });
      if (!dentist) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dentist not found' });
      }
      return dentist;
    }),

  create: adminProcedure
    .input(
      z.object({
        dentistId: z.number().int(),
        name: z.string().min(1),
        specialty: z.string().optional(),
        phone: z.string().optional(),
        active: z.boolean().default(true),
        divisionId: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.dentist.create({ data: input });
    }),

  update: adminProcedure
    .input(
      z.object({
        dentistId: z.number().int(),
        name: z.string().min(1).optional(),
        specialty: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        active: z.boolean().optional(),
        divisionId: z.number().int().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { dentistId, ...data } = input;
      return ctx.prisma.dentist.update({ where: { dentistId }, data });
    }),
});
