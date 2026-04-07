/**
 * Section Router — manages operation sections (categories)
 * Sections group operations (e.g., "Endodontics", "Orthodontics", "Prosthodontics")
 * Original MFC: CSectionSet
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';

export const sectionRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.section.findMany({
      include: {
        operations: {
          select: { operationId: true, name: true, price: true, foreignPrice: true },
          orderBy: { pOrder: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }),

  create: adminProcedure
    .input(
      z.object({
        sectionId: z.number().int(),
        name: z.string().min(1),
        description: z.string().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.section.create({ data: input });
    }),

  update: adminProcedure
    .input(
      z.object({
        sectionId: z.number().int(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sectionId, ...data } = input;
      return ctx.prisma.section.update({ where: { sectionId }, data });
    }),
});
