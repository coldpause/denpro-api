/**
 * Recall Router — Recall types, patient recall scheduling, and due list
 *
 * DenPro recalls are scheduled follow-up reminders (e.g., "6-month cleaning").
 * A Recall defines the type + interval. PatientRecall links it to a patient with due/completed dates.
 * RecallOperation links recalls to the operations they trigger.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const recallRouter = router({
  // ─── Recall Types ──────────────────────────────────────────────────

  /** List all recall types (with linked operations) */
  list: protectedProcedure.query(async () => {
    return prisma.recall.findMany({
      include: {
        recallOperations: {
          include: { operation: { select: { operationId: true, name: true } } },
        },
        _count: { select: { patientRecalls: true } },
      },
      orderBy: { name: 'asc' },
    });
  }),

  /** Create a recall type */
  create: adminProcedure
    .input(
      z.object({
        name: z.string(),
        intervalDays: z.number().optional(),
        description: z.string().optional(),
        operationIds: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.recall.create({
        data: {
          name: input.name,
          intervalDays: input.intervalDays ?? null,
          description: input.description ?? null,
          ...(input.operationIds && {
            recallOperations: {
              createMany: {
                data: input.operationIds.map((opId) => ({ operationId: opId })),
              },
            },
          }),
        },
      });
    }),

  /** Update a recall type */
  update: adminProcedure
    .input(
      z.object({
        recallId: z.number(),
        name: z.string().optional(),
        intervalDays: z.number().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { recallId, ...data } = input;
      return prisma.recall.update({
        where: { recallId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.intervalDays !== undefined && { intervalDays: data.intervalDays }),
          ...(data.description !== undefined && { description: data.description }),
        },
      });
    }),

  // ─── Patient Recalls ───────────────────────────────────────────────

  /** Get recalls for a specific patient */
  getByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        includePast: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = { patientId: input.patientId };
      if (!input.includePast) {
        where.completedDate = null;
      }

      return prisma.patientRecall.findMany({
        where,
        include: {
          recall: true,
          patient: { select: { patientId: true, firstName: true, lastName: true } },
        },
        orderBy: { dueDate: 'asc' },
      });
    }),

  /** Get all overdue patient recalls (due list) */
  getDueList: protectedProcedure
    .input(
      z.object({
        asOfDate: z.coerce.date().optional(),
        skip: z.number().default(0),
        take: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const cutoff = input.asOfDate ?? new Date();
      const where = {
        completedDate: null,
        dueDate: { lte: cutoff },
      };

      const [recalls, total] = await Promise.all([
        prisma.patientRecall.findMany({
          where,
          skip: input.skip,
          take: input.take,
          include: {
            recall: true,
            patient: {
              select: {
                patientId: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
          orderBy: { dueDate: 'asc' },
        }),
        prisma.patientRecall.count({ where }),
      ]);

      return { recalls, total };
    }),

  /** Schedule a recall for a patient */
  scheduleForPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        recallId: z.number(),
        dueDate: z.coerce.date(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.patientRecall.create({
        data: {
          patientId: input.patientId,
          recallId: input.recallId,
          dueDate: input.dueDate,
          status: 0, // pending
        },
        include: { recall: true },
      });
    }),

  /** Mark a patient recall as completed */
  markComplete: protectedProcedure
    .input(
      z.object({
        patientRecallId: z.number(),
        completedDate: z.coerce.date().optional(),
        autoReschedule: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const pr = await prisma.patientRecall.update({
        where: { patientRecallId: input.patientRecallId },
        data: {
          completedDate: input.completedDate ?? new Date(),
          status: 1, // completed
        },
        include: { recall: true },
      });

      // Auto-reschedule based on interval
      if (input.autoReschedule && pr.recall.intervalDays) {
        const nextDue = new Date(pr.completedDate ?? new Date());
        nextDue.setDate(nextDue.getDate() + pr.recall.intervalDays);

        await prisma.patientRecall.create({
          data: {
            patientId: pr.patientId,
            recallId: pr.recallId,
            dueDate: nextDue,
            status: 0,
          },
        });
      }

      return pr;
    }),

  /** Delete a patient recall */
  deletePatientRecall: protectedProcedure
    .input(z.object({ patientRecallId: z.number() }))
    .mutation(async ({ input }) => {
      return prisma.patientRecall.delete({
        where: { patientRecallId: input.patientRecallId },
      });
    }),
});
