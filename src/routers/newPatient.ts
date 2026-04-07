import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

export const newPatientRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1, 'First name is required'),
        lastName: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.newPatient.create({
        data: input,
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        take: z.number().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = input.search
        ? {
            OR: [
              { firstName: { contains: input.search, mode: 'insensitive' as const } },
              { lastName: { contains: input.search, mode: 'insensitive' as const } },
              { phone: { contains: input.search, mode: 'insensitive' as const } },
            ],
          }
        : {};

      return ctx.prisma.newPatient.findMany({
        where,
        take: input.take,
        orderBy: { createdAt: 'desc' },
      });
    }),
});
