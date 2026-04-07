/**
 * Prescription Router — Prescriptions, details, and medicine lookup
 */

import { z } from 'zod';
import { router, protectedProcedure as trpcProtectedProcedure, dentistProcedure as trpcDentistProcedure } from '../trpc';
import { createAuditMiddleware } from '../middleware/audit';

const protectedProcedure = trpcProtectedProcedure.use(createAuditMiddleware('Prescription'));
const dentistProcedure = trpcDentistProcedure.use(createAuditMiddleware('Prescription'));
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const prescriptionInclude = {
  patient: { select: { patientId: true, firstName: true, lastName: true } },
  dentist: { select: { dentistId: true, name: true } },
  details: {
    include: {
      medicine: true,
    },
  },
};

export const prescriptionRouter = router({
  /** List prescriptions (paginated, filterable) */
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.number().optional(),
        dentistId: z.number().optional(),
        skip: z.number().default(0),
        take: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};
      if (input.patientId) where.patientId = input.patientId;
      if (input.dentistId) where.dentistId = input.dentistId;

      const [prescriptions, total] = await Promise.all([
        prisma.prescription.findMany({
          where,
          skip: input.skip,
          take: input.take,
          orderBy: { date: 'desc' },
          include: prescriptionInclude,
        }),
        prisma.prescription.count({ where }),
      ]);

      return { prescriptions, total };
    }),

  /** Get prescriptions for a specific patient */
  getByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        skip: z.number().default(0),
        take: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const [prescriptions, total] = await Promise.all([
        prisma.prescription.findMany({
          where: { patientId: input.patientId },
          skip: input.skip,
          take: input.take,
          orderBy: { date: 'desc' },
          include: prescriptionInclude,
        }),
        prisma.prescription.count({ where: { patientId: input.patientId } }),
      ]);

      return { prescriptions, total };
    }),

  /** Get a single prescription by ID */
  getById: protectedProcedure
    .input(z.object({ prescriptionId: z.number() }))
    .query(async ({ input }) => {
      return prisma.prescription.findUniqueOrThrow({
        where: { prescriptionId: input.prescriptionId },
        include: prescriptionInclude,
      });
    }),

  /** Create a prescription */
  create: dentistProcedure
    .input(
      z.object({
        patientId: z.number(),
        dentistId: z.number().optional(),
        date: z.coerce.date().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.prescription.create({
        data: {
          patientId: input.patientId,
          dentistId: input.dentistId ?? null,
          date: input.date ?? new Date(),
          notes: input.notes ?? null,
        },
        include: prescriptionInclude,
      });
    }),

  /** Add a detail line to a prescription */
  addDetail: dentistProcedure
    .input(
      z.object({
        prescriptionId: z.number(),
        medicineId: z.number().optional(),
        dosage: z.string().optional(),
        instructions: z.string().optional(),
        quantity: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.prescriptionDetail.create({
        data: {
          prescriptionId: input.prescriptionId,
          medicineId: input.medicineId ?? null,
          dosage: input.dosage ?? null,
          instructions: input.instructions ?? null,
          quantity: input.quantity ?? null,
        },
        include: { medicine: true },
      });
    }),

  /** Update a detail line */
  updateDetail: dentistProcedure
    .input(
      z.object({
        prescriptionDetailId: z.number(),
        medicineId: z.number().optional(),
        dosage: z.string().optional(),
        instructions: z.string().optional(),
        quantity: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { prescriptionDetailId, ...data } = input;
      return prisma.prescriptionDetail.update({
        where: { prescriptionDetailId },
        data: {
          ...(data.medicineId !== undefined && { medicineId: data.medicineId }),
          ...(data.dosage !== undefined && { dosage: data.dosage }),
          ...(data.instructions !== undefined && { instructions: data.instructions }),
          ...(data.quantity !== undefined && { quantity: data.quantity }),
        },
        include: { medicine: true },
      });
    }),

  /** Delete a detail line */
  deleteDetail: dentistProcedure
    .input(z.object({ prescriptionDetailId: z.number() }))
    .mutation(async ({ input }) => {
      return prisma.prescriptionDetail.delete({
        where: { prescriptionDetailId: input.prescriptionDetailId },
      });
    }),

  /** Delete an entire prescription */
  delete: dentistProcedure
    .input(z.object({ prescriptionId: z.number() }))
    .mutation(async ({ input }) => {
      return prisma.prescription.delete({
        where: { prescriptionId: input.prescriptionId },
      });
    }),

  // ─── Medicine Lookup ───────────────────────────────────────────────

  /** List medicines (for typeahead/dropdown and catalog) */
  listMedicines: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        activeOnly: z.boolean().optional().default(true),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};
      if (input.search) {
        where.name = { contains: input.search, mode: 'insensitive' };
      }
      if (input.category) {
        where.category = input.category;
      }
      if (input.activeOnly) {
        where.active = true;
      }

      return prisma.medicine.findMany({
        where,
        orderBy: { name: 'asc' },
      });
    }),

  /** Create a medicine */
  createMedicine: dentistProcedure
    .input(
      z.object({
        name: z.string(),
        category: z.string().optional(),
        defaultDosage: z.string().optional(),
        composition: z.string().optional(),
        contraindication: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.medicine.create({
        data: {
          name: input.name,
          category: input.category ?? null,
          defaultDosage: input.defaultDosage ?? null,
          composition: input.composition ?? null,
          contraindication: input.contraindication ?? null,
          active: true,
        },
      });
    }),

  /** Update an existing medicine */
  updateMedicine: dentistProcedure
    .input(
      z.object({
        medicineId: z.number(),
        name: z.string().optional(),
        category: z.string().optional(),
        defaultDosage: z.string().optional(),
        composition: z.string().optional(),
        contraindication: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { medicineId, ...data } = input;
      return prisma.medicine.update({
        where: { medicineId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.defaultDosage !== undefined && { defaultDosage: data.defaultDosage }),
          ...(data.composition !== undefined && { composition: data.composition }),
          ...(data.contraindication !== undefined && { contraindication: data.contraindication }),
          ...(data.active !== undefined && { active: data.active }),
        },
      });
    }),

  /** Archive a medicine (soft delete) */
  archiveMedicine: dentistProcedure
    .input(z.object({ medicineId: z.number() }))
    .mutation(async ({ input }) => {
      return prisma.medicine.update({
        where: { medicineId: input.medicineId },
        data: { active: false },
      });
    }),
});
