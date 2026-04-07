import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { createAuditMiddleware } from '../middleware/audit';

const auditedProcedure = protectedProcedure.use(createAuditMiddleware('Patient'));
import { TRPCError } from '@trpc/server';
import type { ApiPatient } from '../shared';

export const patientRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        skip: z.number().default(0),
        take: z.number().default(10),
        search: z.string().optional(),
        familyId: z.number().optional(),
        patientId: z.number().optional(),
        phone: z.string().optional(),
        patientType: z.number().optional(),
        gender: z.string().optional(),
        pedo: z.boolean().optional(),
        hasBalance: z.boolean().optional(),
        minAge: z.number().optional(),
        maxAge: z.number().optional(),
      })
    )
    .query(async (opts) => {
      const where: any = {};

      if (opts.input.search) {
        where.OR = [
          { firstName: { contains: opts.input.search, mode: 'insensitive' } },
          { middleName: { contains: opts.input.search, mode: 'insensitive' } },
          { lastName: { contains: opts.input.search, mode: 'insensitive' } },
          { patientReference: { contains: opts.input.search, mode: 'insensitive' } },
          { email: { contains: opts.input.search, mode: 'insensitive' } },
          { nickName: { contains: opts.input.search, mode: 'insensitive' } },
        ];
      }

      if (opts.input.familyId !== undefined) {
        where.familyId = opts.input.familyId;
      }

      if (opts.input.patientId !== undefined) {
        where.patientId = opts.input.patientId;
      }

      if (opts.input.phone) {
        where.OR = [
          ...(where.OR || []),
          { phone: { contains: opts.input.phone, mode: 'insensitive' } },
          { mobile: { contains: opts.input.phone, mode: 'insensitive' } },
        ];
      }

      if (opts.input.patientType !== undefined) {
        where.patientType = opts.input.patientType;
      }

      if (opts.input.gender) {
        where.gender = opts.input.gender;
      }

      if (opts.input.pedo !== undefined) {
        where.pedo = opts.input.pedo;
      }

      if (opts.input.minAge !== undefined || opts.input.maxAge !== undefined) {
        const now = new Date();
        const dateConditions: any[] = [];

        if (opts.input.maxAge !== undefined) {
          const maxDate = new Date(now.getFullYear() - opts.input.maxAge, now.getMonth(), now.getDate());
          dateConditions.push({ dateOfBirth: { lte: maxDate } });
        }

        if (opts.input.minAge !== undefined) {
          const minDate = new Date(now.getFullYear() - opts.input.minAge, now.getMonth(), now.getDate());
          dateConditions.push({ dateOfBirth: { gte: minDate } });
        }

        if (dateConditions.length > 0) {
          where.AND = dateConditions;
        }
      }

      // Note: hasBalance filter is applied client-side in the UI since it requires
      // calculating balance from related transaction/invoice tables

      const [patients, total] = await Promise.all([
        opts.ctx.prisma.patient.findMany({
          where,
          skip: opts.input.skip,
          take: opts.input.take,
          include: { addresses: true },
          orderBy: { createdAt: 'desc' },
        }),
        opts.ctx.prisma.patient.count({ where }),
      ]);

      return {
        patients: patients as unknown as ApiPatient[],
        total,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async (opts) => {
      const patient = await opts.ctx.prisma.patient.findUnique({
        where: { patientId: opts.input.patientId },
        include: {
          addresses: true,
          phoneBooks: true,
          patientDiseases: {
            include: { disease: true },
          },
          patientAllergies: true,
          treatments: {
            include: {
              operation: { select: { operationId: true, name: true } },
            },
          },
          appointments: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      return patient as unknown as ApiPatient;
    }),

  create: auditedProcedure
    .input(
      z.object({
        newPatientId: z.number().int().optional(), // If converting from a prospect
        firstName: z.string().min(1),
        middleName: z.string().optional(),
        lastName: z.string().optional(),
        dateOfBirth: z.coerce.date().optional(),
        gender: z.string().optional(),
        phone: z.string().optional(),
        mobile: z.string().optional(),
        email: z.string().email().optional(),
        pedo: z.boolean().default(false),
        patientType: z.number().default(1),
        familyId: z.number().optional(),
        // New legacy-parity fields
        title: z.string().optional(),
        nickName: z.string().optional(),
        patientReference: z.string().optional(),
        nationality: z.string().optional(),
        privateNotes: z.string().optional(),
        physician: z.string().optional(),
        physicianContact: z.string().optional(),
        referredBy: z.string().optional(),
        referredTo: z.string().optional(),
        criticalProblems: z.string().optional(),
        businessPhone: z.string().optional(),
        company: z.string().optional(),
        job: z.string().optional(),
        category: z.string().optional(),
        settings: z.string().optional(),
        fileDate: z.coerce.date().optional(),
        recall: z.coerce.boolean().optional(),
        homeId: z.number().optional(),
        businessId: z.number().optional(),
      })
    )
    .mutation(async (opts) => {
      const patient = await opts.ctx.prisma.$transaction(async (tx) => {
        const p = await tx.patient.create({
          data: {
            firstName: opts.input.firstName,
            middleName: opts.input.middleName,
            lastName: opts.input.lastName,
            dateOfBirth: opts.input.dateOfBirth,
            gender: opts.input.gender,
            phone: opts.input.phone,
            mobile: opts.input.mobile,
            email: opts.input.email,
            pedo: opts.input.pedo,
            patientType: opts.input.patientType,
            familyId: opts.input.familyId,
            title: opts.input.title,
            nickName: opts.input.nickName,
            patientReference: opts.input.patientReference,
            nationality: opts.input.nationality,
            privateNotes: opts.input.privateNotes,
            physician: opts.input.physician,
            physicianContact: opts.input.physicianContact,
            referredBy: opts.input.referredBy,
            referredTo: opts.input.referredTo,
            criticalProblems: opts.input.criticalProblems,
            businessPhone: opts.input.businessPhone,
            company: opts.input.company,
            job: opts.input.job,
            category: opts.input.category,
            settings: opts.input.settings,
            fileDate: opts.input.fileDate,
            recall: opts.input.recall,
            homeId: opts.input.homeId,
            businessId: opts.input.businessId,
          },
          include: { addresses: true },
        });

        // If patientType is 1 (head of family), set familyId to patientId
        if (opts.input.patientType === 1) {
          await tx.patient.update({
            where: { patientId: p.patientId },
            data: { familyId: p.patientId },
          });
          p.familyId = p.patientId;
        }

        // If converting from a prospect (NewPatient)
        if (opts.input.newPatientId) {
          // Update appointments
          await tx.appointment.updateMany({
            where: { newPatientId: opts.input.newPatientId },
            data: { patientId: p.patientId, newPatientId: null },
          });

          // Update waiting room
          await tx.waitingRoom.updateMany({
            where: { newPatientId: opts.input.newPatientId },
            data: { patientId: p.patientId, newPatientId: null },
          });

          // Delete the prospect
          await tx.newPatient.delete({
            where: { newPatientId: opts.input.newPatientId },
          });
        }

        return p;
      });

      return patient;
    }),

  update: auditedProcedure
    .input(
      z.object({
        patientId: z.number(),
        firstName: z.string().min(1).optional(),
        middleName: z.string().optional(),
        lastName: z.string().optional(),
        dateOfBirth: z.coerce.date().optional(),
        gender: z.string().optional(),
        phone: z.string().optional(),
        mobile: z.string().optional(),
        email: z.string().email().optional(),
        pedo: z.boolean().optional(),
        patientType: z.number().optional(),
        familyId: z.number().optional(),
        // New legacy-parity fields
        title: z.string().optional(),
        nickName: z.string().optional(),
        patientReference: z.string().optional(),
        nationality: z.string().optional(),
        privateNotes: z.string().optional(),
        physician: z.string().optional(),
        physicianContact: z.string().optional(),
        referredBy: z.string().optional(),
        referredTo: z.string().optional(),
        criticalProblems: z.string().optional(),
        businessPhone: z.string().optional(),
        company: z.string().optional(),
        job: z.string().optional(),
        category: z.string().optional(),
        settings: z.string().optional(),
        fileDate: z.coerce.date().optional(),
        recall: z.coerce.boolean().optional(),
        homeId: z.number().optional(),
        businessId: z.number().optional(),
      })
    )
    .mutation(async (opts) => {
      const patient = await opts.ctx.prisma.patient.findUnique({
        where: { patientId: opts.input.patientId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const updatedPatient = await opts.ctx.prisma.patient.update({
        where: { patientId: opts.input.patientId },
        data: {
          firstName: opts.input.firstName,
          middleName: opts.input.middleName,
          lastName: opts.input.lastName,
          dateOfBirth: opts.input.dateOfBirth,
          gender: opts.input.gender,
          phone: opts.input.phone,
          mobile: opts.input.mobile,
          email: opts.input.email,
          pedo: opts.input.pedo,
          patientType: opts.input.patientType,
          familyId: opts.input.familyId,
          title: opts.input.title,
          nickName: opts.input.nickName,
          patientReference: opts.input.patientReference,
          nationality: opts.input.nationality,
          privateNotes: opts.input.privateNotes,
          physician: opts.input.physician,
          physicianContact: opts.input.physicianContact,
          referredBy: opts.input.referredBy,
          referredTo: opts.input.referredTo,
          criticalProblems: opts.input.criticalProblems,
          businessPhone: opts.input.businessPhone,
          company: opts.input.company,
          job: opts.input.job,
          category: opts.input.category,
          settings: opts.input.settings,
          fileDate: opts.input.fileDate,
          recall: opts.input.recall,
          homeId: opts.input.homeId,
          businessId: opts.input.businessId,
        },
        include: { addresses: true },
      });

      return updatedPatient as unknown as ApiPatient;
    }),

  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().default(10),
      })
    )
    .query(async (opts) => {
      const patients = await opts.ctx.prisma.patient.findMany({
        where: {
          OR: [
            {
              firstName: {
                contains: opts.input.query,
                mode: 'insensitive',
              },
            },
            {
              middleName: {
                contains: opts.input.query,
                mode: 'insensitive',
              },
            },
            {
              lastName: {
                contains: opts.input.query,
                mode: 'insensitive',
              },
            },
            { phone: { contains: opts.input.query, mode: 'insensitive' } },
            { mobile: { contains: opts.input.query, mode: 'insensitive' } },
            { patientReference: { contains: opts.input.query, mode: 'insensitive' } },
            { email: { contains: opts.input.query, mode: 'insensitive' } },
            { nickName: { contains: opts.input.query, mode: 'insensitive' } },
          ],
        },
        take: opts.input.limit,
        include: { addresses: true },
      });

      return patients;
    }),

  getFamily: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async (opts) => {
      const patient = await opts.ctx.prisma.patient.findUnique({
        where: { patientId: opts.input.patientId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const familyId = patient.familyId || patient.patientId;

      const familyMembers = await opts.ctx.prisma.patient.findMany({
        where: { familyId },
        include: { addresses: true },
      });

      return {
        patientId: opts.input.patientId,
        familyId,
        familyMembers: familyMembers as unknown as ApiPatient[],
      };
    }),

  // Soft-delete (archive) — sets absent=true, never hard-deletes
  archive: auditedProcedure
    .input(z.object({ patientId: z.number() }))
    .mutation(async (opts) => {
      const patient = await opts.ctx.prisma.patient.findUnique({
        where: { patientId: opts.input.patientId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const updated = await opts.ctx.prisma.patient.update({
        where: { patientId: opts.input.patientId },
        data: { absent: true },
      });

      return { success: true, patient: updated };
    }),

  // Restore from archive
  restore: auditedProcedure
    .input(z.object({ patientId: z.number() }))
    .mutation(async (opts) => {
      const updated = await opts.ctx.prisma.patient.update({
        where: { patientId: opts.input.patientId },
        data: { absent: false },
      });

      return { success: true, patient: updated };
    }),

  // Duplicate detection — checks FirstName + LastName + optional MiddleName
  checkDuplicate: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        middleName: z.string().optional(),
      })
    )
    .query(async (opts) => {
      const where: Record<string, unknown> = {
        firstName: { equals: opts.input.firstName, mode: 'insensitive' },
      };

      if (opts.input.lastName) {
        where.lastName = { equals: opts.input.lastName, mode: 'insensitive' };
      }
      if (opts.input.middleName) {
        where.middleName = { equals: opts.input.middleName, mode: 'insensitive' };
      }

      const duplicates = await opts.ctx.prisma.patient.findMany({
        where,
        select: {
          patientId: true,
          firstName: true,
          middleName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          mobile: true,
        },
        take: 5,
      });

      return {
        hasDuplicates: duplicates.length > 0,
        duplicates,
      };
    }),

  // Public endpoint for Patient Passport
  getPublicProfileByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const patient = await ctx.prisma.patient.findUnique({
        where: { passToken: input.token },
        select: {
          patientId: true,
          firstName: true,
          lastName: true,
        }
      });
      if (!patient) {
         throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient passport not found' });
      }
      return patient;
    }),
});
