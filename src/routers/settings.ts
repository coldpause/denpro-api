/**
 * Settings Router — Business info, operators, divisions, and user management
 *
 * DenPro settings live across several tables: Business (clinic info),
 * Division (locations), Operator (staff roles), User (authentication).
 * No separate "settings" table — it's distributed across domain models.
 */

import { z } from 'zod';
import { router, protectedProcedure as trpcProtectedProcedure, adminProcedure as trpcAdminProcedure } from '../trpc';
import { hashPassword } from '../middleware/auth';
import { createAuditMiddleware } from '../middleware/audit';
import { PrismaClient } from '@prisma/client';
import { createBackup, restoreBackup, listBackups } from '../services/backup';

const protectedProcedure = trpcProtectedProcedure.use(createAuditMiddleware('Settings'));
const adminProcedure = trpcAdminProcedure.use(createAuditMiddleware('Settings'));

const prisma = new PrismaClient();

export const settingsRouter = router({
  // ─── Business / Clinic Info ────────────────────────────────────────

  /** Get business (clinic) information */
  getBusiness: protectedProcedure.query(async () => {
    return prisma.business.findFirst();
  }),

  /** Update business (clinic) information */
  updateBusiness: adminProcedure
    .input(
      z.object({
        businessId: z.number(),
        name: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { businessId, ...data } = input;
      return prisma.business.update({
        where: { businessId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.address !== undefined && { address: data.address }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.email !== undefined && { email: data.email }),
        },
      });
    }),

  // ─── Divisions ─────────────────────────────────────────────────────

  /** List divisions (locations) */
  getDivisions: protectedProcedure.query(async () => {
    return prisma.division.findMany({
      include: { _count: { select: { dentists: true } } },
      orderBy: { divisionId: 'asc' },
    });
  }),

  /** Create a division */
  createDivision: adminProcedure
    .input(z.object({ divisionId: z.number(), name: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.division.create({
        data: { divisionId: input.divisionId, name: input.name },
      });
    }),

  /** Update a division */
  updateDivision: adminProcedure
    .input(z.object({ divisionId: z.number(), name: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.division.update({
        where: { divisionId: input.divisionId },
        data: { name: input.name },
      });
    }),

  // ─── Operators ─────────────────────────────────────────────────────

  /** List operators */
  getOperators: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      const where = input?.activeOnly ? { active: true } : {};
      return prisma.operator.findMany({ where, orderBy: { name: 'asc' } });
    }),

  /** Create an operator */
  createOperator: adminProcedure
    .input(
      z.object({
        operatorId: z.number(),
        name: z.string(),
        role: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.operator.create({
        data: {
          operatorId: input.operatorId,
          name: input.name,
          role: input.role ?? null,
        },
      });
    }),

  /** Update an operator */
  updateOperator: adminProcedure
    .input(
      z.object({
        operatorId: z.number(),
        name: z.string().optional(),
        role: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { operatorId, ...data } = input;
      return prisma.operator.update({
        where: { operatorId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.role !== undefined && { role: data.role }),
          ...(data.active !== undefined && { active: data.active }),
        },
      });
    }),

  // ─── Users ─────────────────────────────────────────────────────────

  getUsers: adminProcedure.query(async () => {
    return prisma.user.findMany({
      select: {
        userId: true,
        username: true,
        fullName: true,
        role: true,
        active: true,
      },
      orderBy: { username: 'asc' },
    });
  }),

  /** Create a new user (admin only) */
  createUser: adminProcedure
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(6),
        fullName: z.string().min(1),
        role: z.string().default('user'),
      })
    )
    .mutation(async ({ input }) => {
      const existingUser = await prisma.user.findUnique({
        where: { username: input.username },
      });

      if (existingUser) {
        throw new Error('Username already exists');
      }

      const passwordHash = await hashPassword(input.password);

      const newUser = await prisma.user.create({
        data: {
          username: input.username,
          passwordHash,
          fullName: input.fullName,
          role: input.role,
        },
        select: {
          userId: true,
          username: true,
          fullName: true,
          role: true,
          active: true,
        },
      });

      return newUser;
    }),

  /** Update a user's role or active status */
  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        role: z.string().optional(),
        active: z.boolean().optional(),
        fullName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { userId, ...data } = input;
      return prisma.user.update({
        where: { userId },
        data: {
          ...(data.role !== undefined && { role: data.role }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.fullName !== undefined && { fullName: data.fullName }),
        },
        select: {
          userId: true,
          username: true,
          fullName: true,
          role: true,
          active: true,
        },
      });
    }),

  // ─── Countries (reference data) ───────────────────────────────────

  /** List countries */
  getCountries: protectedProcedure.query(async () => {
    return prisma.country.findMany({ orderBy: { name: 'asc' } });
  }),

  // ─── Procedure Statuses ────────────────────────────────────────────

  /** List procedure statuses */
  getProcStatuses: protectedProcedure.query(async () => {
    return prisma.procStatus.findMany({ orderBy: { procStatusId: 'asc' } });
  }),

  /** Create procedure status */
  createProcStatus: adminProcedure
    .input(z.object({ procStatusId: z.number(), name: z.string(), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      return prisma.procStatus.create({ data: input });
    }),

  /** Update procedure status */
  updateProcStatus: adminProcedure
    .input(z.object({ procStatusId: z.number(), name: z.string().optional(), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const { procStatusId, ...data } = input;
      return prisma.procStatus.update({ where: { procStatusId }, data });
    }),

  // ─── Money Codes ──────────────────────────────────────────────────

  /** List money codes */
  getMoneyCodes: protectedProcedure.query(async () => {
    return prisma.moneyCode.findMany({ orderBy: { moneyCodeId: 'asc' } });
  }),

  /** Create money code */
  createMoneyCode: adminProcedure
    .input(z.object({
      moneyCodeId: z.number(),
      code: z.string(),
      description: z.string(),
      formId: z.number(),
      class: z.number(),
    }))
    .mutation(async ({ input }) => {
      return prisma.moneyCode.create({ data: input });
    }),

  /** Update money code */
  updateMoneyCode: adminProcedure
    .input(z.object({
      moneyCodeId: z.number(),
      code: z.string().optional(),
      description: z.string().optional(),
      formId: z.number().optional(),
      class: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { moneyCodeId, ...data } = input;
      return prisma.moneyCode.update({ where: { moneyCodeId }, data });
    }),

  // ─── Voucher Types ─────────────────────────────────────────────────

  /** List voucher types */
  getVoucherTypes: protectedProcedure.query(async () => {
    return prisma.voucherType.findMany({ orderBy: { voucherTypeId: 'asc' } });
  }),

  /** Create voucher type */
  createVoucherType: adminProcedure
    .input(z.object({ voucherTypeId: z.number(), name: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.voucherType.create({ data: input });
    }),

  /** Update voucher type */
  updateVoucherType: adminProcedure
    .input(z.object({ voucherTypeId: z.number(), name: z.string().optional() }))
    .mutation(async ({ input }) => {
      const { voucherTypeId, ...data } = input;
      return prisma.voucherType.update({ where: { voucherTypeId }, data });
    }),

  // ─── Account Types ─────────────────────────────────────────────────

  /** List account types */
  getAccountTypes: protectedProcedure.query(async () => {
    return prisma.accountType.findMany({ orderBy: { accountTypeId: 'asc' } });
  }),

  /** Create account type */
  createAccountType: adminProcedure
    .input(z.object({ accountTypeId: z.number(), name: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.accountType.create({ data: input });
    }),

  /** Update account type */
  updateAccountType: adminProcedure
    .input(z.object({ accountTypeId: z.number(), name: z.string().optional() }))
    .mutation(async ({ input }) => {
      const { accountTypeId, ...data } = input;
      return prisma.accountType.update({ where: { accountTypeId }, data });
    }),

  // ─── Database Backups ─────────────────────────────────────────────

  /** List available database backups */
  listBackups: adminProcedure.query(async () => {
    return listBackups();
  }),

  /** Create a new database backup */
  createBackup: adminProcedure.mutation(async () => {
    const filename = await createBackup();
    return { success: true, filename };
  }),

  /** Restore a database backup */
  restoreBackup: adminProcedure
    .input(z.object({ filename: z.string() }))
    .mutation(async ({ input }) => {
      await restoreBackup(input.filename);
      return { success: true };
    }),
});

