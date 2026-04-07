import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { createAuditMiddleware } from '../middleware/audit';

const auditedProcedure = protectedProcedure.use(createAuditMiddleware('Room'));

export const roomRouter = router({
  list: protectedProcedure
    .input(z.object({
      includeInactive: z.boolean().optional().default(false)
    }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.includeInactive ? {} : { isActive: true };
      const rooms = await ctx.prisma.room.findMany({
        where,
        orderBy: { name: 'asc' },
      });
      return rooms;
    }),

  create: auditedProcedure
    .input(z.object({
      name: z.string(),
      colorCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.prisma.room.create({
        data: {
          name: input.name,
          colorCode: input.colorCode,
          isActive: true
        }
      });
      return room;
    }),

  update: auditedProcedure
    .input(z.object({
      roomId: z.number(),
      name: z.string().optional(),
      colorCode: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.prisma.room.update({
        where: { roomId: input.roomId },
        data: {
          name: input.name,
          colorCode: input.colorCode,
          isActive: input.isActive
        }
      });
      return room;
    }),

  delete: auditedProcedure
    .input(z.object({ roomId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.room.delete({
        where: { roomId: input.roomId }
      });
      return { success: true };
    })
});
