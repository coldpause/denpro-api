import { z } from 'zod';
import { router, adminProcedure } from '../trpc';

export const auditLogRouter = router({
  list: adminProcedure
    .input(
      z.object({
        skip: z.number().default(0),
        take: z.number().default(50),
        entity: z.string().optional(),
        action: z.string().optional(),
        userId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = {};
      
      if (input.entity) where.entity = input.entity;
      if (input.action) where.action = input.action;
      if (input.userId !== undefined) where.userId = input.userId;

      const [logs, total] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: {
                userId: true,
                username: true,
                fullName: true,
              }
            }
          },
          orderBy: { timestamp: 'desc' },
          skip: input.skip,
          take: input.take,
        }),
        ctx.prisma.auditLog.count({ where }),
      ]);

      return { logs, total };
    }),
});
