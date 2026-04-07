/**
 * ToothMemo Router
 *
 * Per-tooth notes for a patient. Each memo links a patient + tooth (FDI number)
 * to a text note. Original MFC: CToothMemoSet, ToothMemoDlg
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const toothMemoRouter = router({
  /**
   * Get all memos for a patient (optionally filtered by tooth)
   */
  getByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        toothNumber: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = { patientId: input.patientId };

      if (input.toothNumber) {
        // Look up the Teeth record by tooth number
        const tooth = await ctx.prisma.teeth.findFirst({
          where: { toothNumber: input.toothNumber },
        });
        if (tooth) {
          where.toothId = tooth.teethId;
        } else {
          return []; // No matching tooth
        }
      }

      const memos = await ctx.prisma.toothMemo.findMany({
        where,
        include: {
          teeth: { select: { teethId: true, toothNumber: true, name: true } },
        },
        orderBy: { toothId: 'asc' },
      });

      return memos.map(m => ({
        toothMemoId: m.toothMemoId,
        patientId: m.patientId,
        toothNumber: m.teeth.toothNumber,
        toothName: m.teeth.name,
        memo: m.memo,
      }));
    }),

  /**
   * Create or update a memo for a specific tooth
   * Uses upsert-like logic: if a memo already exists for this patient+tooth, update it
   */
  set: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        toothNumber: z.number().int(),
        memo: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Look up the Teeth record
      const tooth = await ctx.prisma.teeth.findFirst({
        where: { toothNumber: input.toothNumber },
      });

      if (!tooth) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Tooth number ${input.toothNumber} not found`,
        });
      }

      // Check for existing memo
      const existing = await ctx.prisma.toothMemo.findFirst({
        where: {
          patientId: input.patientId,
          toothId: tooth.teethId,
        },
      });

      if (existing) {
        // Update existing
        return ctx.prisma.toothMemo.update({
          where: { toothMemoId: existing.toothMemoId },
          data: { memo: input.memo },
        });
      } else {
        // Create new
        return ctx.prisma.toothMemo.create({
          data: {
            patientId: input.patientId,
            toothId: tooth.teethId,
            memo: input.memo,
          },
        });
      }
    }),

  /**
   * Delete a tooth memo
   */
  delete: protectedProcedure
    .input(z.object({ toothMemoId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.toothMemo.delete({
        where: { toothMemoId: input.toothMemoId },
      });
    }),
});
