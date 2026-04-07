/**
 * Operation Router — manages the operations catalog (procedures performed)
 * Operations are grouped by Section. Each operation has a price and display order.
 * Original MFC: COperationSet, COperationListView
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';

export const operationRouter = router({
  list: protectedProcedure
    .input(z.object({ sectionId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.sectionId ? { sectionId: input.sectionId } : {};
      return ctx.prisma.operation.findMany({
        where,
        include: { section: { select: { sectionId: true, name: true } } },
        orderBy: [{ sectionId: 'asc' }, { pOrder: 'asc' }, { name: 'asc' }],
      });
    }),

  getBySection: protectedProcedure
    .input(z.object({ sectionId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.operation.findMany({
        where: { sectionId: input.sectionId },
        orderBy: [{ pOrder: 'asc' }, { name: 'asc' }],
      });
    }),

  create: adminProcedure
    .input(
      z.object({
        operationId: z.number().int(),
        name: z.string().min(1),
        sectionId: z.number().int(),
        price: z.number().default(0),
        graphId: z.number().int().optional(),
        color: z.number().int().optional(),
        colorEx: z.number().int().optional(),
        pOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.operation.create({ data: input });
    }),

  update: adminProcedure
    .input(
      z.object({
        operationId: z.number().int(),
        name: z.string().min(1).optional(),
        sectionId: z.number().int().optional(),
        price: z.number().optional(),
        graphId: z.number().int().nullable().optional(),
        color: z.number().int().nullable().optional(),
        colorEx: z.number().int().nullable().optional(),
        pOrder: z.number().int().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { operationId, ...data } = input;
      return ctx.prisma.operation.update({ where: { operationId }, data });
    }),

  reorder: adminProcedure
    .input(
      z.object({
        operations: z.array(
          z.object({
            operationId: z.number().int(),
            pOrder: z.number().int(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates = input.operations.map((op) =>
        ctx.prisma.operation.update({
          where: { operationId: op.operationId },
          data: { pOrder: op.pOrder },
        })
      );
      return Promise.all(updates);
    }),
});
