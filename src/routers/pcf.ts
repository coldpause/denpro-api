/**
 * PCF (Patient Custom Fields) Router
 *
 * Two-part system:
 * 1. PCFTree — hierarchical tree of custom field definitions (admin-managed)
 * 2. PCFValue — per-patient values for each field
 *
 * Original MFC: CTreeItemSet (tree structure), CPCFValueSet (values)
 * UI: CCustomFieldsView
 *
 * Tree structure example:
 *   root (null parent)
 *   ├── Medical Info (folder)
 *   │   ├── Blood Type (leaf → has PCFValue per patient)
 *   │   └── Insurance # (leaf)
 *   └── Personal (folder)
 *       ├── Employer (leaf)
 *       └── Referred By (leaf)
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const pcfRouter = router({
  // ─── Tree Management (admin) ───

  /**
   * Get the full PCF tree (all nodes)
   * Returns flat list — client builds the tree structure.
   */
  getTree: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.pCFTree.findMany({
      orderBy: [
        { fieldOrder: 'asc' },
        { name: 'asc' },
      ],
    });
  }),

  /**
   * Get tree nodes that are children of a specific parent (or root nodes if parentId is null)
   */
  getChildren: protectedProcedure
    .input(z.object({ parentPCFTreeId: z.number().int().nullable() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.pCFTree.findMany({
        where: { parentPCFTreeId: input.parentPCFTreeId },
        orderBy: [
          { fieldOrder: 'asc' },
          { name: 'asc' },
        ],
      });
    }),

  /**
   * Create a new tree node (folder or field)
   */
  createNode: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        parentPCFTreeId: z.number().int().nullable(),
        fieldOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.pCFTree.create({ data: input });
    }),

  /**
   * Update a tree node
   */
  updateNode: adminProcedure
    .input(
      z.object({
        pcfTreeId: z.number().int(),
        name: z.string().min(1).optional(),
        parentPCFTreeId: z.number().int().nullable().optional(),
        fieldOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { pcfTreeId, ...data } = input;
      return ctx.prisma.pCFTree.update({
        where: { pcfTreeId },
        data,
      });
    }),

  /**
   * Delete a tree node
   * Cascades: deletes child nodes and all associated PCFValues
   */
  deleteNode: adminProcedure
    .input(z.object({ pcfTreeId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Check for children — force user to delete them first (or we could cascade)
      const childCount = await ctx.prisma.pCFTree.count({
        where: { parentPCFTreeId: input.pcfTreeId },
      });
      if (childCount > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete: node has ${childCount} child node(s). Delete children first.`,
        });
      }

      // Delete associated values first, then the node
      await ctx.prisma.pCFValue.deleteMany({
        where: { pcfId: input.pcfTreeId },
      });
      return ctx.prisma.pCFTree.delete({
        where: { pcfTreeId: input.pcfTreeId },
      });
    }),

  // ─── Patient Values ───

  /**
   * Get all custom field values for a patient
   * Includes the field definition (tree node) so the UI knows the label
   */
  getPatientValues: protectedProcedure
    .input(z.object({ patientId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.pCFValue.findMany({
        where: { patientId: input.patientId },
        include: { pcfTree: true },
        orderBy: { pcfValueId: 'asc' },
      });
    }),

  /**
   * Set (create or update) a custom field value for a patient
   * Upsert semantics: if a value already exists for this patient+field, update it
   */
  setValue: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        pcfId: z.number().int(), // pcfTreeId of the field
        value: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if value already exists
      const existing = await ctx.prisma.pCFValue.findFirst({
        where: {
          patientId: input.patientId,
          pcfId: input.pcfId,
        },
      });

      if (existing) {
        return ctx.prisma.pCFValue.update({
          where: { pcfValueId: existing.pcfValueId },
          data: { value: input.value },
          include: { pcfTree: true },
        });
      }

      return ctx.prisma.pCFValue.create({
        data: input,
        include: { pcfTree: true },
      });
    }),

  /**
   * Delete a specific value
   */
  deleteValue: protectedProcedure
    .input(z.object({ pcfValueId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.pCFValue.delete({
        where: { pcfValueId: input.pcfValueId },
      });
    }),

  /**
   * Bulk set values for a patient (used by the custom fields form)
   * Takes an array of { pcfId, value } and upserts them all
   */
  bulkSetValues: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        values: z.array(
          z.object({
            pcfId: z.number().int(),
            value: z.string().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results = [];
      for (const v of input.values) {
        const existing = await ctx.prisma.pCFValue.findFirst({
          where: {
            patientId: input.patientId,
            pcfId: v.pcfId,
          },
        });

        if (existing) {
          results.push(
            await ctx.prisma.pCFValue.update({
              where: { pcfValueId: existing.pcfValueId },
              data: { value: v.value },
              include: { pcfTree: true },
            })
          );
        } else {
          results.push(
            await ctx.prisma.pCFValue.create({
              data: {
                patientId: input.patientId,
                pcfId: v.pcfId,
                value: v.value,
              },
              include: { pcfTree: true },
            })
          );
        }
      }
      return results;
    }),
});
