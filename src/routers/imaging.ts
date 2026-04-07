/**
 * Imaging Router — X-ray records and type management
 *
 * DenPro stores X-ray metadata (date, type, file path, notes) per patient.
 * The actual image files are stored on disk; this router manages the metadata.
 */

import { z } from 'zod';
import { router, protectedProcedure, dentistProcedure, adminProcedure } from '../trpc';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const imagingRouter = router({
  // ─── X-ray Records ─────────────────────────────────────────────────

  /** Get X-rays for a patient (gallery listing — NO image data for performance) */
  getByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        xrayTypeId: z.number().optional(),
        toothId: z.number().optional(),
        skip: z.number().default(0),
        take: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = { patientId: input.patientId };
      if (input.xrayTypeId) where.xrayTypeId = input.xrayTypeId;
      if (input.toothId) where.toothId = input.toothId;

      const [xrays, total] = await Promise.all([
        prisma.xray.findMany({
          where,
          skip: input.skip,
          take: input.take,
          orderBy: { date: 'desc' },
          select: {
            xrayId: true,
            patientId: true,
            xrayTypeId: true,
            date: true,
            filePath: true,
            mimeType: true,
            toothId: true,
            notes: true,
            xrayType: true,
            // imageData intentionally excluded for gallery performance
          },
        }),
        prisma.xray.count({ where }),
      ]);

      // Add a flag for whether image data is available
      const xraysWithFlag = xrays.map(x => ({
        ...x,
        hasImage: false, // We'll check in a separate query if needed
      }));

      return { xrays: xraysWithFlag, total };
    }),

  /** Get a single X-ray by ID (includes full image data) */
  getById: protectedProcedure
    .input(z.object({ xrayId: z.number() }))
    .query(async ({ input }) => {
      return prisma.xray.findUniqueOrThrow({
        where: { xrayId: input.xrayId },
        include: {
          xrayType: true,
          patient: { select: { patientId: true, firstName: true, lastName: true } },
        },
      });
    }),

  /** Get image data for a specific X-ray (separate endpoint for lazy loading) */
  getImageData: protectedProcedure
    .input(z.object({ xrayId: z.number() }))
    .query(async ({ input }) => {
      const xray = await prisma.xray.findUniqueOrThrow({
        where: { xrayId: input.xrayId },
        select: { xrayId: true, imageData: true, mimeType: true },
      });
      return xray;
    }),

  /** Create an X-ray record (with optional Base64 image upload) */
  create: dentistProcedure
    .input(
      z.object({
        patientId: z.number(),
        xrayTypeId: z.number().optional(),
        date: z.coerce.date().optional(),
        filePath: z.string().optional(),
        imageData: z.string().optional(),  // Base64-encoded image
        mimeType: z.string().optional(),   // e.g. "image/jpeg"
        toothId: z.number().optional(),    // FDI tooth number
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.xray.create({
        data: {
          patientId: input.patientId,
          xrayTypeId: input.xrayTypeId ?? null,
          date: input.date ?? new Date(),
          filePath: input.filePath ?? null,
          imageData: input.imageData ?? null,
          mimeType: input.mimeType ?? null,
          toothId: input.toothId ?? null,
          notes: input.notes ?? null,
        },
        include: { xrayType: true },
      });
    }),

  /** Update an X-ray record */
  update: dentistProcedure
    .input(
      z.object({
        xrayId: z.number(),
        xrayTypeId: z.number().optional(),
        filePath: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { xrayId, ...data } = input;
      return prisma.xray.update({
        where: { xrayId },
        data: {
          ...(data.xrayTypeId !== undefined && { xrayTypeId: data.xrayTypeId }),
          ...(data.filePath !== undefined && { filePath: data.filePath }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: { xrayType: true },
      });
    }),

  /** Delete an X-ray record */
  delete: dentistProcedure
    .input(z.object({ xrayId: z.number() }))
    .mutation(async ({ input }) => {
      return prisma.xray.delete({ where: { xrayId: input.xrayId } });
    }),

  // ─── X-ray Types ───────────────────────────────────────────────────

  /** List all X-ray types */
  listTypes: protectedProcedure.query(async () => {
    return prisma.xrayType.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { xrays: true } } },
    });
  }),

  /** Create an X-ray type */
  createType: adminProcedure
    .input(z.object({ xrayTypeId: z.number(), name: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.xrayType.create({
        data: { xrayTypeId: input.xrayTypeId, name: input.name },
      });
    }),
});
