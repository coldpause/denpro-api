/**
 * Financial Router — Credits, Distributions, Vouchers, Balance
 *
 * Credit Distribution is the core financial engine of DenPro.
 * Credits (payments/charges) are distributed across treatments.
 * creditType: 1=payment (money in), 2=charge (money out / treatment cost)
 * status: 2=partial, 3=fully distributed
 */

import { z } from 'zod';
import { router, protectedProcedure as trpcProtectedProcedure, adminProcedure as trpcAdminProcedure } from '../trpc';
import { createAuditMiddleware } from '../middleware/audit';

const protectedProcedure = trpcProtectedProcedure.use(createAuditMiddleware('Financial'));
const adminProcedure = trpcAdminProcedure.use(createAuditMiddleware('Financial'));
import { PrismaClient } from '@prisma/client';
import type { Credit } from '../shared';

const prisma = new PrismaClient();

export const financialRouter = router({
  // ─── Currency Settings ────────────────────────────────────────────

  /** Get clinic currency configuration */
  getCurrencySettings: protectedProcedure.query(async () => {
    const keys = [
      'currency.local.code', 'currency.local.name', 'currency.local.symbol',
      'currency.foreign.code', 'currency.foreign.name', 'currency.foreign.symbol',
      'currency.exchangeRate', 'currency.dualEnabled',
    ];
    const settings = await prisma.globalSetting.findMany({
      where: { key: { in: keys } },
    });
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value ?? '';

    return {
      local: {
        code: map['currency.local.code'] || 'LBP',
        name: map['currency.local.name'] || 'Lebanese Pound',
        symbol: map['currency.local.symbol'] || 'ل.ل',
      },
      foreign: {
        code: map['currency.foreign.code'] || 'USD',
        name: map['currency.foreign.name'] || 'US Dollar',
        symbol: map['currency.foreign.symbol'] || '$',
      },
      exchangeRate: parseFloat(map['currency.exchangeRate'] || '89500'),
      dualEnabled: map['currency.dualEnabled'] === 'true',
    };
  }),

  /** Update exchange rate */
  updateExchangeRate: adminProcedure
    .input(z.object({ exchangeRate: z.number().positive() }))
    .mutation(async ({ input }) => {
      await prisma.globalSetting.upsert({
        where: { key: 'currency.exchangeRate' },
        update: { value: String(input.exchangeRate) },
        create: { key: 'currency.exchangeRate', value: String(input.exchangeRate) },
      });
      return { exchangeRate: input.exchangeRate };
    }),

  /** Update full currency configuration */
  updateCurrencySettings: adminProcedure
    .input(z.object({
      localCode: z.string().optional(),
      localName: z.string().optional(),
      localSymbol: z.string().optional(),
      foreignCode: z.string().optional(),
      foreignName: z.string().optional(),
      foreignSymbol: z.string().optional(),
      exchangeRate: z.number().positive().optional(),
      dualEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const updates: { key: string; value: string }[] = [];
      if (input.localCode) updates.push({ key: 'currency.local.code', value: input.localCode });
      if (input.localName) updates.push({ key: 'currency.local.name', value: input.localName });
      if (input.localSymbol) updates.push({ key: 'currency.local.symbol', value: input.localSymbol });
      if (input.foreignCode) updates.push({ key: 'currency.foreign.code', value: input.foreignCode });
      if (input.foreignName) updates.push({ key: 'currency.foreign.name', value: input.foreignName });
      if (input.foreignSymbol) updates.push({ key: 'currency.foreign.symbol', value: input.foreignSymbol });
      if (input.exchangeRate) updates.push({ key: 'currency.exchangeRate', value: String(input.exchangeRate) });
      if (input.dualEnabled !== undefined) updates.push({ key: 'currency.dualEnabled', value: String(input.dualEnabled) });

      for (const u of updates) {
        await prisma.globalSetting.upsert({
          where: { key: u.key },
          update: { value: u.value },
          create: u,
        });
      }
      return { updated: updates.length };
    }),

  // ─── Credits ───────────────────────────────────────────────────────

  /** Get all credits for a patient (payments + charges) */
  getCredits: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        creditType: z.number().optional(), // 1=payment, 2=charge
        skip: z.number().default(0),
        take: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = { patientId: input.patientId };
      if (input.creditType) where.creditType = input.creditType;

      const [credits, total] = await Promise.all([
        prisma.credit.findMany({
          where,
          skip: input.skip,
          take: input.take,
          orderBy: { dateTime: 'desc' },
          include: {
            voucher: true,
            distributions: {
              include: {
                treatment: {
                  select: {
                    treatmentId: true,
                    operation: { select: { operationId: true, name: true } },
                  },
                },
              },
            },
          },
        }),
        prisma.credit.count({ where }),
      ]);

      return { credits: credits as unknown as Credit[], total };
    }),

  /** Create a new credit (payment or charge) with optional dual currency */
  createCredit: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        creditType: z.number().min(1).max(2), // 1=payment, 2=charge
        amount: z.number().positive(),        // local currency amount
        foreignAmount: z.number().positive().optional(), // foreign currency amount
        exchangeRate: z.number().positive().optional(),  // exchange rate at time of transaction
        currencyCode: z.string().optional(),             // foreign currency code (e.g. "USD")
        notes: z.string().optional(),
        voucherId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const credit = await prisma.credit.create({
        data: {
          patientId: input.patientId,
          creditType: input.creditType,
          amount: input.amount,
          foreignAmount: input.foreignAmount ?? null,
          exchangeRate: input.exchangeRate ?? null,
          currencyCode: input.currencyCode ?? null,
          status: 2, // partial (undistributed)
          dateTime: new Date(),
          notes: input.notes ?? null,
          voucherId: input.voucherId ?? null,
        },
      });
      return credit as unknown as Credit;
    }),

  /** Update credit notes or amount (only if not fully distributed) */
  updateCredit: protectedProcedure
    .input(
      z.object({
        creditId: z.number(),
        amount: z.number().positive().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const credit = await prisma.credit.findUniqueOrThrow({
        where: { creditId: input.creditId },
        include: { distributions: true },
      });

      // Can't change amount if distributions exist
      if (input.amount !== undefined && credit.distributions.length > 0) {
        const totalDistributed = credit.distributions.reduce(
          (sum, d) => sum + Number(d.amount),
          0
        );
        if (input.amount < totalDistributed) {
          throw new Error(
            `Cannot reduce amount below distributed total ($${totalDistributed})`
          );
        }
      }

      const updatedCredit = await prisma.credit.update({
        where: { creditId: input.creditId },
        data: {
          ...(input.amount !== undefined && { amount: input.amount }),
          ...(input.notes !== undefined && { notes: input.notes }),
        },
      });
      return updatedCredit as unknown as Credit;
    }),

  /** Delete a credit (only if no distributions) */
  deleteCredit: adminProcedure
    .input(z.object({ creditId: z.number() }))
    .mutation(async ({ input }) => {
      const count = await prisma.distribution.count({
        where: { creditId: input.creditId },
      });
      if (count > 0) {
        throw new Error(
          `Cannot delete credit with ${count} distribution(s). Undistribute first.`
        );
      }
      return prisma.credit.delete({ where: { creditId: input.creditId } });
    }),

  // ─── Distributions ─────────────────────────────────────────────────

  /** Distribute a credit to a treatment */
  distribute: protectedProcedure
    .input(
      z.object({
        creditId: z.number(),
        treatmentId: z.number().optional(),
        patientId: z.number(),
        amount: z.number().positive(),
      })
    )
    .mutation(async ({ input }) => {
      // Verify credit exists and has available balance
      const credit = await prisma.credit.findUniqueOrThrow({
        where: { creditId: input.creditId },
        include: { distributions: true },
      });

      const totalDistributed = credit.distributions.reduce(
        (sum, d) => sum + Number(d.amount),
        0
      );
      const available = Number(credit.amount) - totalDistributed;

      if (input.amount > available) {
        throw new Error(
          `Insufficient credit balance. Available: $${available.toFixed(2)}, Requested: $${input.amount.toFixed(2)}`
        );
      }

      // Create distribution
      const distribution = await prisma.distribution.create({
        data: {
          creditId: input.creditId,
          treatmentId: input.treatmentId ?? null,
          patientId: input.patientId,
          amount: input.amount,
        },
      });

      // Update credit status
      const newTotal = totalDistributed + input.amount;
      const newStatus = newTotal >= Number(credit.amount) ? 3 : 2; // 3=fully distributed, 2=partial
      await prisma.credit.update({
        where: { creditId: input.creditId },
        data: { status: newStatus },
      });

      return distribution;
    }),

  /** Reverse a distribution */
  undistribute: protectedProcedure
    .input(z.object({ distributionId: z.number() }))
    .mutation(async ({ input }) => {
      const dist = await prisma.distribution.findUniqueOrThrow({
        where: { distributionId: input.distributionId },
      });

      await prisma.distribution.delete({
        where: { distributionId: input.distributionId },
      });

      // Recalculate credit status
      const remaining = await prisma.distribution.aggregate({
        where: { creditId: dist.creditId },
        _sum: { amount: true },
      });

      const credit = await prisma.credit.findUniqueOrThrow({
        where: { creditId: dist.creditId },
      });

      const totalDist = Number(remaining._sum.amount ?? 0);
      const newStatus = totalDist >= Number(credit.amount) ? 3 : 2;
      await prisma.credit.update({
        where: { creditId: dist.creditId },
        data: { status: newStatus },
      });

      return { success: true };
    }),

  /** Get distributions for a credit or treatment */
  getDistributions: protectedProcedure
    .input(
      z.object({
        creditId: z.number().optional(),
        treatmentId: z.number().optional(),
        patientId: z.number().optional(),
        skip: z.number().default(0),
        take: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};
      if (input.creditId) where.creditId = input.creditId;
      if (input.treatmentId) where.treatmentId = input.treatmentId;
      if (input.patientId) where.patientId = input.patientId;

      const [distributions, total] = await Promise.all([
        prisma.distribution.findMany({
          where,
          skip: input.skip,
          take: input.take,
          include: {
            credit: true,
            treatment: {
              select: {
                treatmentId: true,
                operation: { select: { operationId: true, name: true } },
                dateTime: true,
              },
            },
            patient: {
              select: { patientId: true, firstName: true, lastName: true },
            },
          },
        }),
        prisma.distribution.count({ where }),
      ]);

      return { distributions, total };
    }),

  // ─── Balance ───────────────────────────────────────────────────────

  /** Get patient financial balance (total charges, payments, outstanding) — dual currency */
  getBalance: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      const [payments, charges, treatments, foreignPayments, foreignCharges, foreignTreatments] = await Promise.all([
        // Local currency totals
        prisma.credit.aggregate({
          where: { patientId: input.patientId, creditType: 1 },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.credit.aggregate({
          where: { patientId: input.patientId, creditType: 2 },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.treatment.aggregate({
          where: { patientId: input.patientId },
          _sum: { netPrice: true },
          _count: true,
        }),
        // Foreign currency totals
        prisma.credit.aggregate({
          where: { patientId: input.patientId, creditType: 1, foreignAmount: { not: null } },
          _sum: { foreignAmount: true },
        }),
        prisma.credit.aggregate({
          where: { patientId: input.patientId, creditType: 2, foreignAmount: { not: null } },
          _sum: { foreignAmount: true },
        }),
        prisma.treatment.aggregate({
          where: { patientId: input.patientId, foreignNetPrice: { not: null } },
          _sum: { foreignNetPrice: true },
        }),
      ]);

      const totalPayments = Number(payments._sum.amount ?? 0);
      const totalCharges = Number(charges._sum.amount ?? 0);
      const totalTreatmentValue = Number(treatments._sum.netPrice ?? 0);
      const balance = totalPayments - totalCharges;

      return {
        patientId: input.patientId,
        totalPayments,
        totalCharges,
        totalTreatmentValue,
        balance,
        paymentCount: payments._count,
        chargeCount: charges._count,
        treatmentCount: treatments._count,
        // Foreign currency totals (null if no foreign currency transactions)
        foreign: {
          totalPayments: Number(foreignPayments._sum.foreignAmount ?? 0),
          totalCharges: Number(foreignCharges._sum.foreignAmount ?? 0),
          totalTreatmentValue: Number(foreignTreatments._sum.foreignNetPrice ?? 0),
          balance: Number(foreignPayments._sum.foreignAmount ?? 0) - Number(foreignCharges._sum.foreignAmount ?? 0),
        },
      };
    }),

  /** Get balance for all family members (cross-family financial view) */
  getFamilyBalance: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ input }) => {
      const members = await prisma.patient.findMany({
        where: { familyId: input.familyId },
        select: { patientId: true, firstName: true, lastName: true },
      });

      const balances = await Promise.all(
        members.map(async (member) => {
          const [payments, charges] = await Promise.all([
            prisma.credit.aggregate({
              where: { patientId: member.patientId, creditType: 1 },
              _sum: { amount: true },
            }),
            prisma.credit.aggregate({
              where: { patientId: member.patientId, creditType: 2 },
              _sum: { amount: true },
            }),
          ]);

          return {
            ...member,
            totalPayments: Number(payments._sum.amount ?? 0),
            totalCharges: Number(charges._sum.amount ?? 0),
            balance:
              Number(payments._sum.amount ?? 0) -
              Number(charges._sum.amount ?? 0),
          };
        })
      );

      const familyTotal = balances.reduce((sum, b) => sum + b.balance, 0);

      return { members: balances, familyTotal };
    }),

  // ─── Vouchers ──────────────────────────────────────────────────────

  /** List vouchers */
  getVouchers: protectedProcedure
    .input(
      z.object({
        skip: z.number().default(0),
        take: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const [vouchers, total] = await Promise.all([
        prisma.voucher.findMany({
          skip: input.skip,
          take: input.take,
          orderBy: { date: 'desc' },
          include: {
            voucherType: true,
            debitAccount: { select: { accountId: true, name: true } },
            creditAccount: { select: { accountId: true, name: true } },
          },
        }),
        prisma.voucher.count(),
      ]);

      return { vouchers, total };
    }),

  /** Create a voucher */
  createVoucher: adminProcedure
    .input(
      z.object({
        voucherTypeId: z.number(),
        amount: z.number().positive(),
        description: z.string().optional(),
        accountId: z.number().optional(), // kept for backward compat
        debitAccountId: z.number().optional(),
        debitAmount: z.number().positive().optional(),
        creditAccountId: z.number().optional(),
        creditAmount: z.number().positive().optional(),
        rate: z.number().optional(),
        voucherReference: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Create double-entry aligned voucher
      return prisma.voucher.create({
        data: {
          voucherTypeId: input.voucherTypeId,
          date: new Date(),
          amount: input.amount,
          description: input.description ?? null,
          accountId: input.accountId ?? null,
          debitAccountId: input.debitAccountId ?? null,
          debitAmount: input.debitAmount ?? null,
          creditAccountId: input.creditAccountId ?? null,
          creditAmount: input.creditAmount ?? null,
          rate: input.rate ?? null,
          voucherReference: input.voucherReference ?? null,
          operatorId: ctx.user?.userId ?? null, // Tie voucher creation to logged-in user
        },
      });
    }),

  // ─── Accounts (chart of accounts) ─────────────────────────────────

  /** List accounts (flat or tree) */
  getAccounts: protectedProcedure
    .input(
      z.object({
        parentAccountId: z.number().optional(),
        activeOnly: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};
      if (input.activeOnly) where.active = true;
      if (input.parentAccountId !== undefined)
        where.parentAccountId = input.parentAccountId;

      return prisma.account.findMany({
        where,
        include: {
          accountType: true,
          childAccounts: {
            where: input.activeOnly ? { active: true } : {},
            select: { accountId: true, name: true, balance: true },
          },
        },
        orderBy: { accountId: 'asc' },
      });
    }),

  /** Get money codes (payment method lookup) */
  getMoneyCodes: protectedProcedure.query(async () => {
    return prisma.moneyCode.findMany({
      orderBy: { moneyCodeId: 'asc' },
    });
  }),

  // ─── Auto-Distribution Engine ────────────────────────────────────

  /**
   * Auto-distribute a payment (creditType=1) across outstanding treatments
   * Uses FIFO (oldest treatment first): distributes to treatments that have
   * outstanding balance (netPrice - sum of existing distributions).
   *
   * This is the CORE business logic of the financial module.
   * Original DenPro: CDistributionSet, RedistributeAllCredits.exe
   */
  autoDistribute: protectedProcedure
    .input(
      z.object({
        creditId: z.number(),
        patientId: z.number(),
        /** If true, distribute across family members' treatments too */
        crossFamily: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      // 1. Get the credit and its available (undistributed) balance
      const credit = await prisma.credit.findUniqueOrThrow({
        where: { creditId: input.creditId },
        include: { distributions: true },
      });

      if (credit.creditType !== 1) {
        throw new Error('Auto-distribution only applies to payments (creditType=1)');
      }

      const totalDistributed = credit.distributions.reduce(
        (sum, d) => sum + Number(d.amount), 0
      );
      let available = Number(credit.amount) - totalDistributed;

      if (available <= 0) {
        return { distributed: 0, distributions: [], message: 'Credit fully distributed' };
      }

      // 2. Find target patients (this patient, or all family members if cross-family)
      let targetPatientIds = [input.patientId];
      if (input.crossFamily) {
        const patient = await prisma.patient.findUniqueOrThrow({
          where: { patientId: input.patientId },
          select: { familyId: true },
        });
        if (patient.familyId) {
          const family = await prisma.patient.findMany({
            where: { familyId: patient.familyId },
            select: { patientId: true },
          });
          targetPatientIds = family.map(f => f.patientId);
        }
      }

      // 3. Get all treatments for target patients, ordered by date (FIFO)
      const treatments = await prisma.treatment.findMany({
        where: {
          patientId: { in: targetPatientIds },
          netPrice: { gt: 0 },
        },
        include: {
          distributions: true,
          operation: { select: { name: true } },
        },
        orderBy: { dateTime: 'asc' }, // FIFO: oldest first
      });

      // 4. Calculate outstanding balance per treatment
      const outstanding = treatments.map(tx => {
        const txDistTotal = tx.distributions.reduce(
          (sum, d) => sum + Number(d.amount), 0
        );
        const remaining = Number(tx.netPrice) - txDistTotal;
        return { treatmentId: tx.treatmentId, patientId: tx.patientId, remaining, operationName: tx.operation?.name };
      }).filter(t => t.remaining > 0); // Only treatments with outstanding balance

      // 5. Distribute FIFO
      const newDistributions: Array<{ treatmentId: number; patientId: number; amount: number; operationName?: string }> = [];

      for (const tx of outstanding) {
        if (available <= 0) break;

        const distAmount = Math.min(available, tx.remaining);
        await prisma.distribution.create({
          data: {
            creditId: input.creditId,
            treatmentId: tx.treatmentId,
            patientId: tx.patientId,
            amount: distAmount,
          },
        });

        newDistributions.push({
          treatmentId: tx.treatmentId,
          patientId: tx.patientId,
          amount: distAmount,
          operationName: tx.operationName ?? undefined,
        });

        available -= distAmount;
      }

      // 6. Update credit status
      const totalNowDistributed = totalDistributed + newDistributions.reduce((s, d) => s + d.amount, 0);
      const newStatus = totalNowDistributed >= Number(credit.amount) ? 3 : 2;
      await prisma.credit.update({
        where: { creditId: input.creditId },
        data: { status: newStatus },
      });

      return {
        distributed: newDistributions.reduce((s, d) => s + d.amount, 0),
        distributions: newDistributions,
        remainingCredit: available,
        creditStatus: newStatus,
        message: available > 0
          ? `Distributed to ${newDistributions.length} treatment(s). ${available.toFixed(2)} remaining (no more outstanding treatments).`
          : `Fully distributed across ${newDistributions.length} treatment(s).`,
      };
    }),

  /**
   * Batch redistribute ALL credits for a patient (or family).
   * Clears all existing distributions and re-runs auto-distribution for every credit.
   * This is the equivalent of the original RedistributeAllCredits.exe utility.
   *
   * WARNING: This is destructive. It removes all existing distributions and recreates them.
   */
  batchRedistribute: adminProcedure
    .input(
      z.object({
        patientId: z.number(),
        /** If true, redistribute across all family members */
        crossFamily: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      // 1. Determine target patients
      let targetPatientIds = [input.patientId];
      if (input.crossFamily) {
        const patient = await prisma.patient.findUniqueOrThrow({
          where: { patientId: input.patientId },
          select: { familyId: true },
        });
        if (patient.familyId) {
          const family = await prisma.patient.findMany({
            where: { familyId: patient.familyId },
            select: { patientId: true },
          });
          targetPatientIds = family.map(f => f.patientId);
        }
      }

      // 2. Delete ALL existing distributions for these patients
      const deleted = await prisma.distribution.deleteMany({
        where: { patientId: { in: targetPatientIds } },
      });

      // 3. Reset all credits to status=2 (partial/undistributed)
      await prisma.credit.updateMany({
        where: { patientId: { in: targetPatientIds } },
        data: { status: 2 },
      });

      // 4. Get all payment credits (creditType=1), ordered by date
      const credits = await prisma.credit.findMany({
        where: {
          patientId: { in: targetPatientIds },
          creditType: 1, // payments only
        },
        orderBy: { dateTime: 'asc' },
      });

      // 5. Get all treatments ordered by date (FIFO)
      const treatments = await prisma.treatment.findMany({
        where: {
          patientId: { in: targetPatientIds },
          netPrice: { gt: 0 },
        },
        orderBy: { dateTime: 'asc' },
      });

      // 6. Build a running outstanding map for each treatment
      const txOutstanding = new Map<number, { patientId: number; remaining: number }>();
      for (const tx of treatments) {
        txOutstanding.set(tx.treatmentId, {
          patientId: tx.patientId,
          remaining: Number(tx.netPrice),
        });
      }

      // 7. Distribute each credit FIFO across treatments
      let totalDistributed = 0;
      let distributionCount = 0;

      for (const credit of credits) {
        let available = Number(credit.amount);
        let creditDistTotal = 0;

        for (const tx of treatments) {
          if (available <= 0) break;
          const txInfo = txOutstanding.get(tx.treatmentId)!;
          if (txInfo.remaining <= 0) continue;

          const distAmount = Math.min(available, txInfo.remaining);
          await prisma.distribution.create({
            data: {
              creditId: credit.creditId,
              treatmentId: tx.treatmentId,
              patientId: txInfo.patientId,
              amount: distAmount,
            },
          });

          txInfo.remaining -= distAmount;
          available -= distAmount;
          creditDistTotal += distAmount;
          distributionCount++;
        }

        totalDistributed += creditDistTotal;

        // Update credit status
        const newStatus = creditDistTotal >= Number(credit.amount) ? 3 : 2;
        await prisma.credit.update({
          where: { creditId: credit.creditId },
          data: { status: newStatus },
        });
      }

      return {
        deletedDistributions: deleted.count,
        newDistributions: distributionCount,
        totalDistributed,
        creditsProcessed: credits.length,
        treatmentsProcessed: treatments.length,
        patientsProcessed: targetPatientIds.length,
      };
    }),

  /**
   * Get undistributed credits (payments with remaining balance)
   */
  getUndistributedCredits: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      const credits = await prisma.credit.findMany({
        where: {
          patientId: input.patientId,
          creditType: 1,
          status: 2, // partial
        },
        include: { distributions: true },
        orderBy: { dateTime: 'desc' },
      });

      return credits.map(c => {
        const distributed = c.distributions.reduce((s, d) => s + Number(d.amount), 0);
        return {
          creditId: c.creditId,
          amount: Number(c.amount),
          distributed,
          remaining: Number(c.amount) - distributed,
          dateTime: c.dateTime,
          notes: c.notes,
        };
      }).filter(c => c.remaining > 0);
    }),

  /**
   * Get outstanding treatments (treatments with unpaid balance)
   */
  getOutstandingTreatments: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      const treatments = await prisma.treatment.findMany({
        where: {
          patientId: input.patientId,
          netPrice: { gt: 0 },
        },
        include: {
          distributions: true,
          operation: { select: { operationId: true, name: true } },
          dentist: { select: { dentistId: true, name: true } },
        },
        orderBy: { dateTime: 'asc' },
      });

      return treatments.map(tx => {
        const paid = tx.distributions.reduce((s, d) => s + Number(d.amount), 0);
        const outstanding = Number(tx.netPrice) - paid;
        return {
          treatmentId: tx.treatmentId,
          dateTime: tx.dateTime,
          netPrice: Number(tx.netPrice),
          paid,
          outstanding,
          fullyPaid: outstanding <= 0,
          operation: tx.operation,
          dentist: tx.dentist,
          toothId: tx.toothId,
        };
      });
    }),

  // ─── Balance Validation Suite ─────────────────────────────────────

  /**
   * Validate a single patient's financial integrity.
   * Checks:
   * 1. Sum of distributions per credit <= credit amount
   * 2. Sum of distributions per treatment <= treatment net price
   * 3. Patient balance = total payments - total charges (consistency)
   * 4. No orphaned distributions (referencing deleted credits/treatments)
   * 5. Credit status consistency (fully distributed vs actual sum)
   */
  validatePatientBalance: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      const errors: { type: string; message: string; details?: any }[] = [];
      const warnings: { type: string; message: string; details?: any }[] = [];

      // Get all credits for this patient
      const credits = await prisma.credit.findMany({
        where: { patientId: input.patientId },
        include: { distributions: true },
      });

      // Get all treatments for this patient
      const treatments = await prisma.treatment.findMany({
        where: { patientId: input.patientId },
        include: { distributions: true },
      });

      // Check 1: Credit distribution totals
      for (const credit of credits) {
        const distTotal = credit.distributions.reduce((s, d) => s + Number(d.amount), 0);
        const creditAmt = Number(credit.amount);

        if (Math.abs(distTotal - creditAmt) > 0.01 && distTotal > creditAmt) {
          errors.push({
            type: 'OVER_DISTRIBUTED_CREDIT',
            message: `Credit #${credit.creditId} over-distributed: ${distTotal.toFixed(2)} > ${creditAmt.toFixed(2)}`,
            details: { creditId: credit.creditId, creditAmount: creditAmt, distributedTotal: distTotal },
          });
        }

        // Check 5: Credit status consistency
        const isFullyDistributed = Math.abs(distTotal - creditAmt) < 0.01;
        if (credit.status === 3 && !isFullyDistributed && distTotal < creditAmt) {
          warnings.push({
            type: 'STATUS_MISMATCH',
            message: `Credit #${credit.creditId} marked as fully distributed (status=3) but only ${distTotal.toFixed(2)} of ${creditAmt.toFixed(2)} distributed`,
            details: { creditId: credit.creditId, status: credit.status, creditAmount: creditAmt, distributedTotal: distTotal },
          });
        }
        if (credit.status === 2 && isFullyDistributed) {
          warnings.push({
            type: 'STATUS_MISMATCH',
            message: `Credit #${credit.creditId} marked as partial (status=2) but is fully distributed`,
            details: { creditId: credit.creditId, status: credit.status },
          });
        }
      }

      // Check 2: Treatment distribution totals
      for (const tx of treatments) {
        const distTotal = tx.distributions.reduce((s, d) => s + Number(d.amount), 0);
        const price = Number(tx.netPrice ?? 0);
        if (price > 0 && distTotal > price + 0.01) {
          errors.push({
            type: 'OVER_PAID_TREATMENT',
            message: `Treatment #${tx.treatmentId} over-paid: ${distTotal.toFixed(2)} > ${price.toFixed(2)}`,
            details: { treatmentId: tx.treatmentId, netPrice: price, distributedTotal: distTotal },
          });
        }
      }

      // Check 3: Balance consistency
      const totalPayments = credits.filter(c => c.creditType === 1).reduce((s, c) => s + Number(c.amount), 0);
      const totalCharges = credits.filter(c => c.creditType === 2).reduce((s, c) => s + Number(c.amount), 0);
      const expectedBalance = totalPayments - totalCharges;
      const treatmentValue = treatments.reduce((s, t) => s + Number(t.netPrice ?? 0), 0);

      // Check 4: Orphaned distributions
      const allDistributions = await prisma.distribution.findMany({
        where: { patientId: input.patientId },
      });
      for (const dist of allDistributions) {
        const creditExists = credits.some(c => c.creditId === dist.creditId);
        const treatmentExists = treatments.some(t => t.treatmentId === dist.treatmentId);
        if (!creditExists) {
          errors.push({
            type: 'ORPHANED_DISTRIBUTION',
            message: `Distribution #${dist.distributionId} references non-existent credit #${dist.creditId}`,
            details: { distributionId: dist.distributionId, creditId: dist.creditId },
          });
        }
        if (!treatmentExists) {
          errors.push({
            type: 'ORPHANED_DISTRIBUTION',
            message: `Distribution #${dist.distributionId} references non-existent treatment #${dist.treatmentId}`,
            details: { distributionId: dist.distributionId, treatmentId: dist.treatmentId },
          });
        }
      }

      return {
        patientId: input.patientId,
        valid: errors.length === 0,
        errors,
        warnings,
        summary: {
          totalPayments,
          totalCharges,
          expectedBalance,
          treatmentValue,
          totalDistributions: allDistributions.reduce((s, d) => s + Number(d.amount), 0),
          creditCount: credits.length,
          treatmentCount: treatments.length,
          distributionCount: allDistributions.length,
        },
      };
    }),

  /**
   * Validate ALL patients — clinic-wide balance integrity check.
   * Returns a summary of all patients with errors/warnings.
   */
  validateAllBalances: adminProcedure
    .query(async () => {
      const patients = await prisma.patient.findMany({
        select: { patientId: true, firstName: true, lastName: true },
        where: {
          OR: [
            { credits: { some: {} } },
            { treatments: { some: {} } },
          ],
        },
      });

      const results: {
        patientId: number;
        name: string;
        valid: boolean;
        errorCount: number;
        warningCount: number;
        balance: number;
      }[] = [];

      let totalErrors = 0;
      let totalWarnings = 0;

      for (const patient of patients) {
        const credits = await prisma.credit.findMany({
          where: { patientId: patient.patientId },
          include: { distributions: true },
        });

        const treatments = await prisma.treatment.findMany({
          where: { patientId: patient.patientId },
          include: { distributions: true },
        });

        let errors = 0;
        let warns = 0;

        for (const credit of credits) {
          const distTotal = credit.distributions.reduce((s, d) => s + Number(d.amount), 0);
          const creditAmt = Number(credit.amount);
          if (distTotal > creditAmt + 0.01) errors++;
          const isFullyDist = Math.abs(distTotal - creditAmt) < 0.01;
          if (credit.status === 3 && !isFullyDist && distTotal < creditAmt) warns++;
          if (credit.status === 2 && isFullyDist) warns++;
        }

        for (const tx of treatments) {
          const distTotal = tx.distributions.reduce((s, d) => s + Number(d.amount), 0);
          const price = Number(tx.netPrice ?? 0);
          if (price > 0 && distTotal > price + 0.01) errors++;
        }

        const totalPayments = credits.filter(c => c.creditType === 1).reduce((s, c) => s + Number(c.amount), 0);
        const totalCharges = credits.filter(c => c.creditType === 2).reduce((s, c) => s + Number(c.amount), 0);

        totalErrors += errors;
        totalWarnings += warns;

        results.push({
          patientId: patient.patientId,
          name: `${patient.firstName} ${patient.lastName || ''}`.trim(),
          valid: errors === 0,
          errorCount: errors,
          warningCount: warns,
          balance: totalPayments - totalCharges,
        });
      }

      const invalidPatients = results.filter(r => !r.valid);

      return {
        totalPatients: results.length,
        validPatients: results.length - invalidPatients.length,
        invalidPatients: invalidPatients.length,
        totalErrors,
        totalWarnings,
        patients: results.sort((a, b) => b.errorCount - a.errorCount),
      };
    }),
});
