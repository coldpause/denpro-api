/**
 * Report Router — Data aggregation queries for report generation
 *
 * Reports in DenPro are generated client-side using React-PDF.
 * This router provides the data aggregation queries needed by each report type.
 * The original system had 52 Crystal Reports — we implement the data layer here.
 */

// @ts-nocheck
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface TxRow {
  date: string;
  type: 'treatment' | 'payment' | 'charge';
  description: string;
  debit: number;
  credit: number;
  balance: number;
  reference: string | null;
}

export const reportRouter = router({
  /** Patient Summary — demographics, treatments, financial balance */
  patientSummary: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      const [patient, treatments, credits, appointments] = await Promise.all([
        prisma.patient.findUniqueOrThrow({
          where: { patientId: input.patientId },
          include: {
            addresses: true,
            patientDiseases: { include: { disease: true } },
            patientAllergies: true,
          },
        }),
        prisma.treatment.findMany({
          where: { patientId: input.patientId },
          include: {
            operation: { select: { name: true } },
            dentist: { select: { name: true } },
            procStatus: { select: { name: true } },
          },
          orderBy: { dateTime: 'desc' },
        }),
        prisma.credit.aggregate({
          where: { patientId: input.patientId },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.appointment.count({
          where: { patientId: input.patientId },
        }),
      ]);

      const totalTreatmentValue = treatments.reduce(
        (sum, t) => sum + Number(t.netPrice),
        0
      );

      return {
        patient,
        treatments,
        totalTreatmentValue,
        totalCredits: Number(credits._sum.amount ?? 0),
        creditCount: credits._count,
        appointmentCount: appointments,
      };
    }),

  /** Treatment History — all treatments in date range, optionally filtered */
  treatmentHistory: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        dentistId: z.number().optional(),
        sectionId: z.number().optional(),
        procStatusId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};
      if (input.startDate || input.endDate) {
        where.dateTime = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }
      if (input.dentistId) where.dentistId = input.dentistId;
      if (input.procStatusId) where.procStatusId = input.procStatusId;
      if (input.sectionId) {
        where.operation = { sectionId: input.sectionId };
      }

      const treatments = await prisma.treatment.findMany({
        where,
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true } },
          operation: { select: { name: true, sectionId: true } },
          dentist: { select: { name: true } },
          procStatus: { select: { name: true } },
        },
        orderBy: { dateTime: 'desc' },
      });

      const totalValue = treatments.reduce(
        (sum, t) => sum + Number(t.netPrice),
        0
      );

      return { treatments, totalValue, count: treatments.length };
    }),

  /** Financial Summary — payments, charges, balance per patient or clinic-wide */
  financialSummary: protectedProcedure
    .input(
      z.object({
        patientId: z.number().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateFilter: Record<string, unknown> = {};
      if (input.startDate || input.endDate) {
        dateFilter.dateTime = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      const baseWhere = {
        ...(input.patientId && { patientId: input.patientId }),
        ...dateFilter,
      };

      const [payments, charges] = await Promise.all([
        prisma.credit.aggregate({
          where: { ...baseWhere, creditType: 1 },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.credit.aggregate({
          where: { ...baseWhere, creditType: 2 },
          _sum: { amount: true },
          _count: true,
        }),
      ]);

      return {
        totalPayments: Number(payments._sum.amount ?? 0),
        totalCharges: Number(charges._sum.amount ?? 0),
        balance:
          Number(payments._sum.amount ?? 0) - Number(charges._sum.amount ?? 0),
        paymentCount: payments._count,
        chargeCount: charges._count,
      };
    }),

  /** Appointment Schedule — appointments in date range */
  appointmentSchedule: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        dentistId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {
        date: { gte: input.startDate, lte: input.endDate },
      };
      if (input.dentistId) where.dentistId = input.dentistId;

      return prisma.appointment.findMany({
        where,
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true } },
          dentist: { select: { name: true } },
          appointmentType: { select: { name: true } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    }),

  /** Recall Report — overdue and upcoming recalls */
  recallReport: protectedProcedure
    .input(
      z.object({
        asOfDate: z.coerce.date().optional(),
        includeCompleted: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const cutoff = input.asOfDate ?? new Date();
      const where: Record<string, unknown> = {};
      if (!input.includeCompleted) where.completedDate = null;

      const recalls = await prisma.patientRecall.findMany({
        where,
        include: {
          recall: true,
          patient: {
            select: { patientId: true, firstName: true, lastName: true, phone: true },
          },
        },
        orderBy: { dueDate: 'asc' },
      });

      const overdue = recalls.filter(
        (r) => r.dueDate && new Date(r.dueDate) <= cutoff && !r.completedDate
      );
      const upcoming = recalls.filter(
        (r) => r.dueDate && new Date(r.dueDate) > cutoff && !r.completedDate
      );

      return { overdue, upcoming, total: recalls.length };
    }),

  /** Monthly Production Report — production summary by dentist over date range */
  monthlyProduction: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        dentistId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {
        dateTime: { gte: input.startDate, lte: input.endDate },
      };
      if (input.dentistId) where.dentistId = input.dentistId;

      // All treatments in range
      const treatments = await prisma.treatment.findMany({
        where,
        include: {
          dentist: { select: { dentistId: true, name: true } },
        },
      });

      // All payments in range
      const payments = await prisma.credit.findMany({
        where: {
          dateTime: { gte: input.startDate, lte: input.endDate },
          creditType: 1,
        },
      });

      // Aggregate by dentist
      const dentistMap = new Map<number, {
        dentistId: number;
        name: string;
        treatmentCount: number;
        totalProduction: number;
        totalCollections: number;
      }>();

      for (const t of treatments) {
        const did = t.dentistId ?? 0;
        const dname = t.dentist?.name ?? 'Unassigned';
        if (!dentistMap.has(did)) {
          dentistMap.set(did, { dentistId: did, name: dname, treatmentCount: 0, totalProduction: 0, totalCollections: 0 });
        }
        const d = dentistMap.get(did)!;
        d.treatmentCount += 1;
        d.totalProduction += Number(t.netPrice);
      }

      // Attribute collections: payments often don't have dentistId directly,
      // so we sum all payments as clinic-wide collections
      const totalCollectionsAll = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      // Daily breakdown
      const dayMap = new Map<string, { date: string; treatmentCount: number; production: number; collections: number }>();
      for (const t of treatments) {
        const dayKey = t.dateTime ? new Date(t.dateTime).toISOString().split('T')[0] : '1970-01-01';
        if (!dayMap.has(dayKey)) {
          dayMap.set(dayKey, { date: dayKey, treatmentCount: 0, production: 0, collections: 0 });
        }
        const d = dayMap.get(dayKey)!;
        d.treatmentCount += 1;
        d.production += Number(t.netPrice);
      }
      for (const p of payments) {
        const dayKey = p.dateTime ? new Date(p.dateTime).toISOString().split('T')[0] : '1970-01-01';
        if (!dayMap.has(dayKey)) {
          dayMap.set(dayKey, { date: dayKey, treatmentCount: 0, production: 0, collections: 0 });
        }
        dayMap.get(dayKey)!.collections += Number(p.amount);
      }

      const grandTotalProduction = treatments.reduce((sum, t) => sum + Number(t.netPrice), 0);

      // Distribute collections proportionally to dentists based on production share
      for (const [, d] of dentistMap) {
        const share = grandTotalProduction > 0 ? d.totalProduction / grandTotalProduction : 0;
        d.totalCollections = Math.round(totalCollectionsAll * share);
      }

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        title: 'Monthly Production Report',
        dentists: Array.from(dentistMap.values()).sort((a, b) => b.totalProduction - a.totalProduction),
        dailyBreakdown: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
        grandTotalProduction,
        grandTotalCollections: totalCollectionsAll,
        grandTreatmentCount: treatments.length,
      };
    }),

  /** Statement of Account — all transactions for a patient in date range */
  statementOfAccount: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ input }) => {
      const patient = await prisma.patient.findUniqueOrThrow({
        where: { patientId: input.patientId },
        select: {
          patientId: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      });

      // Get address if available
      const address = await prisma.address.findFirst({
        where: { patientId: input.patientId },
      });

      // Treatments (debits) in date range
      const treatments = await prisma.treatment.findMany({
        where: {
          patientId: input.patientId,
          dateTime: { gte: input.startDate, lte: input.endDate },
        },
        include: { operation: { select: { name: true } } },
        orderBy: { dateTime: 'asc' },
      });

      // Credits (payments) in date range
      const credits = await prisma.credit.findMany({
        where: {
          patientId: input.patientId,
          dateTime: { gte: input.startDate, lte: input.endDate },
        },
        orderBy: { dateTime: 'asc' },
      });

      // Calculate opening balance (everything before startDate)
      const [priorTreatments, priorCredits] = await Promise.all([
        prisma.treatment.aggregate({
          where: { patientId: input.patientId, dateTime: { lt: input.startDate } },
          _sum: { netPrice: true },
        }),
        prisma.credit.aggregate({
          where: { patientId: input.patientId, dateTime: { lt: input.startDate } },
          _sum: { amount: true },
        }),
      ]);

      const priorDebits = Number(priorTreatments._sum.netPrice ?? 0);
      const priorPayments = Number(priorCredits._sum.amount ?? 0);
      const openingBalance = priorPayments - priorDebits; // positive = credit, negative = owed

      // Build transaction list

      const transactions: TxRow[] = [];
      let runningBalance = openingBalance;

      // Merge treatments and credits by date
      type RawTx = { date: Date; kind: 'debit' | 'credit'; amount: number; desc: string; ref: string | null };
      const rawTxs: RawTx[] = [];

      for (const t of treatments) {
        rawTxs.push({
          date: t.dateTime ?? new Date(0),
          kind: 'debit',
          amount: Number(t.netPrice),
          desc: t.operation?.name ?? 'Treatment',
          ref: `T${t.treatmentId}`,
        });
      }
      for (const c of credits) {
        rawTxs.push({
          date: c.dateTime ?? new Date(0),
          kind: 'credit',
          amount: Number(c.amount),
          desc: c.notes ?? '',
          ref: `C${c.creditId}`,
        });
      }

      rawTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let totalDebits = 0;
      let totalCredits = 0;

      for (const tx of rawTxs) {
        if (tx.kind === 'debit') {
          runningBalance -= tx.amount;
          totalDebits += tx.amount;
          transactions.push({
            date: new Date(tx.date).toISOString(),
            type: 'treatment',
            description: tx.desc,
            debit: tx.amount,
            credit: 0,
            balance: runningBalance,
            reference: tx.ref,
          });
        } else {
          runningBalance += tx.amount;
          totalCredits += tx.amount;
          transactions.push({
            date: new Date(tx.date).toISOString(),
            type: 'payment',
            description: tx.desc,
            debit: 0,
            credit: tx.amount,
            balance: runningBalance,
            reference: tx.ref,
          });
        }
      }

      const addressStr = address
        ? [address.street, address.city, address.state].filter(Boolean).join(', ')
        : null;

      return {
        patient: {
          ...patient,
          address: addressStr,
        },
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        openingBalance,
        transactions,
        closingBalance: runningBalance,
        totalDebits,
        totalCredits,
      };
    }),

  /** Daily Production Report — treatments + payments for a day */
  dailyProduction: protectedProcedure
    .input(z.object({ date: z.coerce.date() }))
    .query(async ({ input }) => {
      const dayStart = new Date(input.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(input.date);
      dayEnd.setHours(23, 59, 59, 999);

      const [treatments, payments] = await Promise.all([
        prisma.treatment.findMany({
          where: { dateTime: { gte: dayStart, lte: dayEnd } },
          include: {
            patient: { select: { firstName: true, lastName: true } },
            operation: { select: { name: true } },
            dentist: { select: { name: true } },
          },
        }),
        prisma.credit.findMany({
          where: { dateTime: { gte: dayStart, lte: dayEnd }, creditType: 1 },
          include: {
            patient: { select: { firstName: true, lastName: true } },
          },
        }),
      ]);

      const totalProduction = treatments.reduce(
        (sum, t) => sum + Number(t.netPrice),
        0
      );
      const totalCollections = payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0
      );

      return {
        date: input.date,
        treatments,
        payments,
        totalProduction,
        totalCollections,
      };
    }),

  /** Age Analysis — aging receivables by patient */
  ageAnalysis: protectedProcedure
    .input(z.object({ asOfDate: z.coerce.date().optional() }))
    .query(async ({ input }) => {
      const asOf = input.asOfDate ?? new Date();
      const now = asOf.getTime();

      // Get all patients with treatments
      const patients = await prisma.patient.findMany({
        select: {
          patientId: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      });

      const result: Array<{
        patientId: number;
        name: string;
        phone: string | null;
        totalOwed: number;
        current: number;
        days30: number;
        days60: number;
        days90: number;
        lastPaymentDate: string | null;
      }> = [];

      for (const p of patients) {
        // Get treatments and credits
        const [treatmentAgg, creditAgg, treatments, lastPayment] = await Promise.all([
          prisma.treatment.aggregate({
            where: { patientId: p.patientId },
            _sum: { netPrice: true },
          }),
          prisma.credit.aggregate({
            where: { patientId: p.patientId },
            _sum: { amount: true },
          }),
          prisma.treatment.findMany({
            where: { patientId: p.patientId },
            select: { netPrice: true, dateTime: true },
          }),
          prisma.credit.findFirst({
            where: { patientId: p.patientId },
            orderBy: { dateTime: 'desc' },
            select: { dateTime: true },
          }),
        ]);

        const totalTreatments = Number(treatmentAgg._sum.netPrice ?? 0);
        const totalCredits = Number(creditAgg._sum.amount ?? 0);
        const balance = totalTreatments - totalCredits;

        if (balance <= 0) continue; // skip patients with no outstanding balance

        // Bucket treatments by age
        let current = 0, days30 = 0, days60 = 0, days90 = 0;
        for (const t of treatments) {
          if (!t.dateTime) continue;
          const age = Math.floor((now - new Date(t.dateTime!).getTime()) / (1000 * 60 * 60 * 24));
          const amt = Number(t.netPrice);
          if (age <= 30) current += amt;
          else if (age <= 60) days30 += amt;
          else if (age <= 90) days60 += amt;
          else days90 += amt;
        }

        // Scale buckets proportionally to actual outstanding balance
        const bucketTotal = current + days30 + days60 + days90;
        if (bucketTotal > 0) {
          const scale = balance / bucketTotal;
          current = Math.round(current * scale);
          days30 = Math.round(days30 * scale);
          days60 = Math.round(days60 * scale);
          days90 = Math.round(days90 * scale);
        }

        const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
        result.push({
          patientId: p.patientId,
          name,
          phone: p.phone ?? null,
          totalOwed: balance,
          current,
          days30,
          days60,
          days90,
          lastPaymentDate: lastPayment?.dateTime?.toISOString() ?? null,
        });
      }

      result.sort((a, b) => b.totalOwed - a.totalOwed);

      const totals = result.reduce(
        (acc, r) => ({
          totalOwed: acc.totalOwed + r.totalOwed,
          current: acc.current + r.current,
          days30: acc.days30 + r.days30,
          days60: acc.days60 + r.days60,
          days90: acc.days90 + r.days90,
        }),
        { totalOwed: 0, current: 0, days30: 0, days60: 0, days90: 0 }
      );

      return {
        asOfDate: asOf.toISOString(),
        patients: result,
        totals,
        patientCount: result.length,
      };
    }),

  /** Cash Flow Report — daily cash inflows and outflows */
  cashFlow: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ input }) => {
      const credits = await prisma.credit.findMany({
        where: {
          dateTime: { gte: input.startDate, lte: input.endDate },
        },
        orderBy: { dateTime: 'asc' },
      });

      // Group by day
      const dayMap = new Map<string, { paymentsIn: number; refundsOut: number; paymentCount: number; foreignIn: number; foreignOut: number }>();

      for (const c of credits) {
        const dayKey = c.dateTime ? new Date(c.dateTime).toISOString().split('T')[0] : '1970-01-01';
        if (!dayMap.has(dayKey)) {
          dayMap.set(dayKey, { paymentsIn: 0, refundsOut: 0, paymentCount: 0, foreignIn: 0, foreignOut: 0 });
        }
        const d = dayMap.get(dayKey)!;
        const amt = Number(c.amount);
        if (amt >= 0) {
          d.paymentsIn += amt;
          d.paymentCount += 1;
          if (c.foreignAmount) d.foreignIn += Number(c.foreignAmount);
        } else {
          d.refundsOut += Math.abs(amt);
          if (c.foreignAmount) d.foreignOut += Math.abs(Number(c.foreignAmount));
        }
      }

      const dailyFlows = Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({
          date,
          paymentsIn: d.paymentsIn,
          refundsOut: d.refundsOut,
          netCashFlow: d.paymentsIn - d.refundsOut,
          paymentCount: d.paymentCount,
          foreignPaymentsIn: d.foreignIn > 0 ? d.foreignIn : null,
          foreignRefundsOut: d.foreignOut > 0 ? d.foreignOut : null,
        }));

      const totalPaymentsIn = dailyFlows.reduce((s, d) => s + d.paymentsIn, 0);
      const totalRefundsOut = dailyFlows.reduce((s, d) => s + d.refundsOut, 0);
      const totalForeignIn = dailyFlows.reduce((s, d) => s + (d.foreignPaymentsIn ?? 0), 0);
      const totalForeignOut = dailyFlows.reduce((s, d) => s + (d.foreignRefundsOut ?? 0), 0);

      // Get foreign currency code from settings
      let foreignCurrency: string | null = null;
      try {
        const setting = await prisma.globalSetting.findFirst({ where: { key: 'foreignCurrencyCode' } });
        foreignCurrency = setting?.value ?? null;
      } catch { /* ignore */ }

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        dailyFlows,
        totalPaymentsIn,
        totalRefundsOut,
        totalNetCashFlow: totalPaymentsIn - totalRefundsOut,
        totalPaymentCount: dailyFlows.reduce((s, d) => s + d.paymentCount, 0),
        foreignCurrency,
        totalForeignIn: totalForeignIn > 0 ? totalForeignIn : null,
        totalForeignOut: totalForeignOut > 0 ? totalForeignOut : null,
      };
    }),

  /** Operation Production — production by operation/procedure type */
  operationProduction: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ input }) => {
      const treatments = await prisma.treatment.findMany({
        where: {
          dateTime: { gte: input.startDate, lte: input.endDate },
        },
        include: {
          operation: {
            include: { section: { select: { name: true } } },
          },
        },
      });

      // Group by operation
      const opMap = new Map<number, {
        operationId: number;
        operationName: string;
        sectionName: string;
        treatmentCount: number;
        totalProduction: number;
      }>();

      for (const t of treatments) {
        const opId = t.operationId ?? 0;
        const opName = t.operation?.name ?? 'Unknown';
        const secName = t.operation?.section?.name ?? 'General';
        if (!opMap.has(opId)) {
          opMap.set(opId, { operationId: opId, operationName: opName, sectionName: secName, treatmentCount: 0, totalProduction: 0 });
        }
        const o = opMap.get(opId)!;
        o.treatmentCount += 1;
        o.totalProduction += Number(t.netPrice);
      }

      // Group by section
      const sectionMap = new Map<string, {
        sectionName: string;
        operations: typeof opMap extends Map<number, infer V> ? V[] : never;
        sectionTotal: number;
        sectionCount: number;
      }>();

      for (const [, op] of opMap) {
        if (!sectionMap.has(op.sectionName)) {
          sectionMap.set(op.sectionName, { sectionName: op.sectionName, operations: [], sectionTotal: 0, sectionCount: 0 });
        }
        const s = sectionMap.get(op.sectionName)!;
        s.operations.push({ ...op, averageFee: op.treatmentCount > 0 ? Math.round(op.totalProduction / op.treatmentCount) : 0 } as any);
        s.sectionTotal += op.totalProduction;
        s.sectionCount += op.treatmentCount;
      }

      const sections = Array.from(sectionMap.values())
        .sort((a, b) => b.sectionTotal - a.sectionTotal)
        .map(s => ({
          ...s,
          operations: (s.operations as any[]).sort((a: any, b: any) => b.totalProduction - a.totalProduction),
        }));

      const grandTotalProduction = treatments.reduce((sum, t) => sum + Number(t.netPrice), 0);
      const grandTreatmentCount = treatments.length;

      // Find top operation
      let topOp: string | null = null;
      let topVal = 0;
      for (const [, op] of opMap) {
        if (op.totalProduction > topVal) {
          topVal = op.totalProduction;
          topOp = op.operationName;
        }
      }

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        sections,
        grandTotalProduction,
        grandTreatmentCount,
        topOperation: topOp,
      };
    }),

  /** Patient List — directory of all patients with balance info */
  patientList: protectedProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const patients = await prisma.patient.findMany({
        select: {
          patientId: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          createdAt: true,
        },
        orderBy: { firstName: 'asc' },
      });

      const result = [];
      let totalOwed = 0;
      let totalCredit = 0;
      let activeCount = 0;

      for (const p of patients) {
        const [treatmentAgg, creditAgg, lastTreatment] = await Promise.all([
          prisma.treatment.aggregate({
            where: { patientId: p.patientId },
            _sum: { netPrice: true },
          }),
          prisma.credit.aggregate({
            where: { patientId: p.patientId },
            _sum: { amount: true },
          }),
          prisma.treatment.findFirst({
            where: { patientId: p.patientId },
            orderBy: { dateTime: 'desc' },
            select: { dateTime: true },
          }),
        ]);

        const balance = Number(treatmentAgg._sum.netPrice ?? 0) - Number(creditAgg._sum.amount ?? 0);
        const lastVisit = lastTreatment?.dateTime?.toISOString() ?? null;

        if (balance > 0) totalOwed += balance;
        if (balance < 0) totalCredit += Math.abs(balance);
        if (lastVisit) activeCount++;

        result.push({
          patientId: p.patientId,
          name: [p.firstName, p.lastName].filter(Boolean).join(' '),
          phone: p.phone,
          email: p.email,
          registrationDate: p.createdAt?.toISOString() ?? null,
          balance,
          lastVisit,
        });
      }

      return {
        patients: result,
        totalPatients: result.length,
        totalOwed,
        totalCredit,
        activeCount,
      };
    }),

  /** Dentist Performance — detailed per-dentist production and patient stats */
  dentistPerformance: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ input }) => {
      const treatments = await prisma.treatment.findMany({
        where: {
          dateTime: { gte: input.startDate, lte: input.endDate },
        },
        include: {
          dentist: { select: { dentistId: true, name: true } },
        },
      });

      const payments = await prisma.credit.findMany({
        where: {
          dateTime: { gte: input.startDate, lte: input.endDate },
          amount: { gt: 0 },
        },
      });

      // Group by dentist
      const dentMap = new Map<number, {
        dentistId: number;
        name: string;
        patients: Set<number>;
        treatmentCount: number;
        totalProduction: number;
      }>();

      for (const t of treatments) {
        const did = t.dentistId ?? 0;
        const dname = t.dentist?.name ?? 'Unassigned';
        if (!dentMap.has(did)) {
          dentMap.set(did, { dentistId: did, name: dname, patients: new Set(), treatmentCount: 0, totalProduction: 0 });
        }
        const d = dentMap.get(did)!;
        d.patients.add(t.patientId!);
        d.treatmentCount += 1;
        d.totalProduction += Number(t.netPrice);
      }

      const totalCollections = payments.reduce((s, p) => s + Number(p.amount), 0);
      const grandTotalProduction = treatments.reduce((s, t) => s + Number(t.netPrice), 0);

      const dentists = Array.from(dentMap.values())
        .map(d => {
          const share = grandTotalProduction > 0 ? d.totalProduction / grandTotalProduction : 0;
          return {
            dentistId: d.dentistId,
            name: d.name,
            patientCount: d.patients.size,
            treatmentCount: d.treatmentCount,
            totalProduction: d.totalProduction,
            totalCollections: Math.round(totalCollections * share),
            avgPerTreatment: d.treatmentCount > 0 ? Math.round(d.totalProduction / d.treatmentCount) : 0,
          };
        })
        .sort((a, b) => b.totalProduction - a.totalProduction);

      const grandPatientCount = new Set(treatments.map(t => t.patientId)).size;
      const topDentist = dentists.length > 0 ? dentists[0].name : null;

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        dentists,
        grandTotalProduction,
        grandTotalCollections: totalCollections,
        grandPatientCount,
        grandTreatmentCount: treatments.length,
        topDentist,
      };
    }),

  /** Profit & Loss — income statement for the clinic */
  profitLoss: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ input }) => {
      const dateFilter = { gte: input.startDate, lte: input.endDate };

      const [treatments, payments, refunds] = await Promise.all([
        prisma.treatment.findMany({
          where: { dateTime: dateFilter },
          include: {
            operation: { include: { section: { select: { name: true } } } },
          },
        }),
        prisma.credit.aggregate({
          where: { dateTime: dateFilter, amount: { gt: 0 } },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.credit.aggregate({
          where: { dateTime: dateFilter, amount: { lt: 0 } },
          _sum: { amount: true },
          _count: true,
        }),
      ]);

      // Revenue by section
      const sectionMap = new Map<string, number>();
      for (const t of treatments) {
        const sec = t.operation?.section?.name ?? 'General';
        sectionMap.set(sec, (sectionMap.get(sec) ?? 0) + Number(t.netPrice));
      }

      const bySection = Array.from(sectionMap.entries())
        .map(([sectionName, amount]) => ({ sectionName, amount }))
        .sort((a, b) => b.amount - a.amount);

      const totalProduction = treatments.reduce((s, t) => s + Number(t.netPrice), 0);
      const totalCollections = Number(payments._sum.amount ?? 0);
      const totalRefunds = Math.abs(Number(refunds._sum.amount ?? 0));
      const writeOffs = Math.max(0, totalProduction - totalCollections - totalRefunds);

      const netIncome = totalCollections - totalRefunds;
      const collectionRate = totalProduction > 0
        ? Math.round((totalCollections / totalProduction) * 100)
        : 0;

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        revenue: { totalProduction, bySection },
        collections: { totalCollections, paymentCount: payments._count },
        adjustments: { writeOffs, refunds: totalRefunds },
        netIncome,
        collectionRate,
      };
    }),

  /** General Ledger — account transactions for the period */
  generalLedger: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        accountId: z.number().optional(),
        mode: z.enum(['local', 'foreign', 'summary']).default('local'),
      })
    )
    .query(async ({ input }) => {
      const dateFilter = { gte: input.startDate, lte: input.endDate };

      const accounts = await prisma.account.findMany({
        where: input.accountId ? { accountId: input.accountId } : undefined,
        include: {
          accountType: true,
          vouchers: {
            where: { date: dateFilter },
            include: { voucherType: true },
            orderBy: { date: 'asc' },
          },
        },
        orderBy: { accountId: 'asc' },
      });

      const ledger = accounts
        .filter(a => a.vouchers.length > 0)
        .map(account => {
          let runningBalance = Number(account.balance ?? 0);
          // Calculate opening balance by subtracting period transactions
          const periodTotal = account.vouchers.reduce((s, v) => s + Number(v.amount), 0);
          const openingBalance = runningBalance - periodTotal;
          let balance = openingBalance;

          const entries = account.vouchers.map(v => {
            const amt = Number(v.amount);
            balance += amt;
            return {
              date: new Date(v.date).toISOString(),
              voucherId: v.voucherId,
              voucherType: v.voucherType.name,
              description: v.description ?? '',
              debit: amt >= 0 ? amt : 0,
              credit: amt < 0 ? Math.abs(amt) : 0,
              balance,
            };
          });

          const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
          const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

          return {
            accountId: account.accountId,
            accountName: account.name,
            accountType: account.accountType.name,
            openingBalance,
            closingBalance: balance,
            totalDebit,
            totalCredit,
            entries,
          };
        });

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        mode: input.mode,
        accounts: ledger,
        grandTotalDebit: ledger.reduce((s, a) => s + a.totalDebit, 0),
        grandTotalCredit: ledger.reduce((s, a) => s + a.totalCredit, 0),
      };
    }),

  /** Journal Voucher Report — detailed voucher listing */
  journalVoucher: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        voucherTypeId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const vouchers = await prisma.voucher.findMany({
        where: {
          date: { gte: input.startDate, lte: input.endDate },
          ...(input.voucherTypeId ? { voucherTypeId: input.voucherTypeId } : {}),
        },
        include: {
          voucherType: true,
          account: { include: { accountType: true } },
          credits: { include: { patient: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { date: 'asc' },
      });

      const grouped = new Map<string, typeof vouchers>();
      for (const v of vouchers) {
        const key = v.voucherType.name;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(v);
      }

      const byType = Array.from(grouped.entries()).map(([typeName, items]) => ({
        typeName,
        count: items.length,
        totalAmount: items.reduce((s, v) => s + Number(v.amount), 0),
        vouchers: items.map(v => ({
          voucherId: v.voucherId,
          date: new Date(v.date).toISOString(),
          amount: Number(v.amount),
          description: v.description ?? '',
          accountName: v.account?.name ?? 'N/A',
          accountType: v.account?.accountType?.name ?? '',
          relatedPatients: v.credits.map(c => `${c.patient.firstName} ${c.patient.lastName}`),
        })),
      }));

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        byType,
        totalVouchers: vouchers.length,
        grandTotal: vouchers.reduce((s, v) => s + Number(v.amount), 0),
      };
    }),

  /** Birthday List — patients with birthdays in a month range */
  birthdayList: protectedProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12).optional(),
      })
    )
    .query(async ({ input }) => {
      const patients = await prisma.patient.findMany({
        where: { dateOfBirth: { not: null } },
        select: {
          patientId: true,
          firstName: true,
          middleName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          mobile: true,
          gender: true,
        },
        orderBy: { dateOfBirth: 'asc' },
      });

      const now = new Date();
      const targetMonth = input.month ?? (now.getMonth() + 1);

      const filtered = patients.filter(p => {
        if (!p.dateOfBirth) return false;
        return new Date(p.dateOfBirth).getMonth() + 1 === targetMonth;
      });

      // Sort by day within the month
      filtered.sort((a, b) => {
        const dayA = new Date(a.dateOfBirth!).getDate();
        const dayB = new Date(b.dateOfBirth!).getDate();
        return dayA - dayB;
      });

      const result = filtered.map(p => {
        const dob = new Date(p.dateOfBirth!);
        const age = now.getFullYear() - dob.getFullYear();
        return {
          patientId: p.patientId,
          name: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
          dateOfBirth: dob.toISOString(),
          day: dob.getDate(),
          age,
          gender: p.gender,
          phone: p.phone ?? p.mobile ?? '',
        };
      });

      return {
        month: targetMonth,
        monthName: new Date(2000, targetMonth - 1, 1).toLocaleDateString('en', { month: 'long' }),
        patients: result,
        total: result.length,
      };
    }),

  /** Section Production — revenue grouped by section */
  sectionProduction: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        detailed: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const treatments = await prisma.treatment.findMany({
        where: { dateTime: { gte: input.startDate, lte: input.endDate } },
        include: {
          operation: { include: { section: true } },
          patient: { select: { firstName: true, lastName: true } },
          dentist: { select: { name: true } },
        },
        orderBy: { dateTime: 'asc' },
      });

      const sectionMap = new Map<string, {
        sectionName: string;
        totalAmount: number;
        count: number;
        treatments: Array<{
          date: string;
          patientName: string;
          operationName: string;
          dentistName: string;
          amount: number;
          toothId: number | null;
        }>;
      }>();

      for (const t of treatments) {
        const secName = t.operation?.section?.name ?? 'General';
        if (!sectionMap.has(secName)) {
          sectionMap.set(secName, { sectionName: secName, totalAmount: 0, count: 0, treatments: [] });
        }
        const sec = sectionMap.get(secName)!;
        const amt = Number(t.netPrice);
        sec.totalAmount += amt;
        sec.count++;
        if (input.detailed) {
          sec.treatments.push({
            date: t.dateTime ? new Date(t.dateTime).toISOString() : '',
            patientName: `${t.patient?.firstName ?? ''} ${t.patient?.lastName ?? ''}`.trim(),
            operationName: t.operation?.name ?? 'Unknown',
            dentistName: t.dentist?.name ?? 'Unknown',
            amount: amt,
            toothId: t.toothId ?? null,
          });
        }
      }

      const sections = Array.from(sectionMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
      const grandTotal = sections.reduce((s, sec) => s + sec.totalAmount, 0);

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        sections: sections.map(s => ({
          ...s,
          percentage: grandTotal > 0 ? Math.round((s.totalAmount / grandTotal) * 1000) / 10 : 0,
        })),
        grandTotal,
        totalTreatments: treatments.length,
      };
    }),

  /** Yearly Production — monthly breakdown for a year */
  yearlyProduction: protectedProcedure
    .input(
      z.object({
        year: z.number(),
        byDentist: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.year, 0, 1);
      const endDate = new Date(input.year, 11, 31, 23, 59, 59);

      const treatments = await prisma.treatment.findMany({
        where: { dateTime: { gte: startDate, lte: endDate } },
        include: { dentist: { select: { name: true } } },
      });

      const credits = await prisma.credit.findMany({
        where: { dateTime: { gte: startDate, lte: endDate }, amount: { gt: 0 } },
      });

      // Monthly production
      const months = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        monthName: new Date(2000, i, 1).toLocaleDateString('en', { month: 'short' }),
        production: 0,
        collections: 0,
        treatmentCount: 0,
      }));

      for (const t of treatments) {
        if (!t.dateTime) continue;
        const m = new Date(t.dateTime).getMonth();
        months[m].production += Number(t.netPrice);
        months[m].treatmentCount++;
      }

      for (const c of credits) {
        if (!c.dateTime) continue;
        const m = new Date(c.dateTime).getMonth();
        months[m].collections += Number(c.amount);
      }

      // By dentist breakdown
      let byDentist: Array<{ dentistName: string; monthly: number[]; total: number }> = [];
      if (input.byDentist) {
        const dentistMap = new Map<string, number[]>();
        for (const t of treatments) {
          const name = t.dentist?.name ?? 'Unknown';
          if (!dentistMap.has(name)) dentistMap.set(name, new Array(12).fill(0));
          if (t.dateTime) dentistMap.get(name)![new Date(t.dateTime).getMonth()] += Number(t.netPrice);
        }
        byDentist = Array.from(dentistMap.entries())
          .map(([dentistName, monthly]) => ({
            dentistName,
            monthly,
            total: monthly.reduce((s, v) => s + v, 0),
          }))
          .sort((a, b) => b.total - a.total);
      }

      const totalProduction = months.reduce((s, m) => s + m.production, 0);
      const totalCollections = months.reduce((s, m) => s + m.collections, 0);

      return {
        year: input.year,
        months,
        byDentist,
        totalProduction,
        totalCollections,
        collectionRate: totalProduction > 0 ? Math.round((totalCollections / totalProduction) * 100) : 0,
      };
    }),

  /** Family List — families with member counts and balances */
  familyList: protectedProcedure
    .input(
      z.object({
        includeAging: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      // Family heads are patients with patientType=1, members reference them via familyId
      const heads = await prisma.patient.findMany({
        where: { patientType: 1 },
        select: {
          patientId: true,
          firstName: true,
          lastName: true,
          phone: true,
          mobile: true,
          treatments: { select: { netPrice: true, dateTime: true } },
          credits: { select: { amount: true, dateTime: true } },
          familyMembers: {
            select: {
              patientId: true,
              firstName: true,
              lastName: true,
              treatments: { select: { netPrice: true, dateTime: true } },
              credits: { select: { amount: true, dateTime: true } },
            },
          },
        },
      });

      const now = new Date();

      const result = heads.map((head) => {
        const allMembers = [head, ...head.familyMembers];
        const totalTreatments = allMembers.reduce(
          (s: number, p) => s + p.treatments.reduce((s2: number, t) => s2 + Number(t.netPrice), 0), 0
        );
        const totalPayments = allMembers.reduce(
          (s: number, p) => s + p.credits.reduce((s2: number, c) => s2 + Number(c.amount), 0), 0
        );
        const balance = totalTreatments - totalPayments;

        let aging = { current: 0, over30: 0, over60: 0, over90: 0 };
        if (input.includeAging) {
          for (const p of allMembers) {
            for (const t of p.treatments) {
              const days = t.dateTime ? Math.floor((now.getTime() - new Date(t.dateTime).getTime()) / 86400000) : 999;
              const amt = Number(t.netPrice);
              if (days <= 30) aging.current += amt;
              else if (days <= 60) aging.over30 += amt;
              else if (days <= 90) aging.over60 += amt;
              else aging.over90 += amt;
            }
          }
          const totalAging = aging.current + aging.over30 + aging.over60 + aging.over90;
          if (totalAging > 0 && balance > 0) {
            const scale = balance / totalAging;
            aging.current *= scale;
            aging.over30 *= scale;
            aging.over60 *= scale;
            aging.over90 *= scale;
          }
        }

        return {
          familyId: head.patientId,
          headName: `${head.firstName} ${head.lastName ?? ''}`.trim(),
          phone: head.phone ?? head.mobile ?? '',
          memberCount: allMembers.length,
          totalTreatments,
          totalPayments,
          balance,
          ...(input.includeAging ? { aging } : {}),
        };
      });

      return {
        families: result.sort((a: { balance: number }, b: { balance: number }) => b.balance - a.balance),
        totalFamilies: result.length,
        totalOutstanding: result.reduce((s: number, f: { balance: number }) => s + Math.max(0, f.balance), 0),
      };
    }),

  /** Daily Production Summary — condensed production totals by dentist for a day */
  dailyProdSummary: protectedProcedure
    .input(z.object({ date: z.coerce.date() }))
    .query(async ({ input }) => {
      const start = new Date(input.date); start.setHours(0, 0, 0, 0);
      const end = new Date(input.date); end.setHours(23, 59, 59, 999);
      const dateFilter = { gte: start, lte: end };

      const [treatments, credits] = await Promise.all([
        prisma.treatment.findMany({
          where: { dateTime: dateFilter },
          include: { dentist: { select: { name: true } }, operation: { include: { section: true } } },
        }),
        prisma.credit.findMany({
          where: { dateTime: dateFilter, amount: { gt: 0 } },
        }),
      ]);

      // By dentist
      const dentistMap = new Map<string, { production: number; count: number }>();
      for (const t of treatments) {
        const name = t.dentist?.name ?? 'Unknown';
        const entry = dentistMap.get(name) ?? { production: 0, count: 0 };
        entry.production += Number(t.netPrice);
        entry.count++;
        dentistMap.set(name, entry);
      }

      // By section
      const sectionMap = new Map<string, { amount: number; count: number }>();
      for (const t of treatments) {
        const sec = t.operation?.section?.name ?? 'General';
        const entry = sectionMap.get(sec) ?? { amount: 0, count: 0 };
        entry.amount += Number(t.netPrice);
        entry.count++;
        sectionMap.set(sec, entry);
      }

      const totalProduction = treatments.reduce((s, t) => s + Number(t.netPrice), 0);
      const totalCollections = credits.reduce((s, c) => s + Number(c.amount), 0);

      return {
        date: start.toISOString(),
        byDentist: Array.from(dentistMap.entries()).map(([name, d]) => ({ dentistName: name, ...d })),
        bySection: Array.from(sectionMap.entries()).map(([name, d]) => ({ sectionName: name, ...d })),
        totalProduction,
        totalCollections,
        treatmentCount: treatments.length,
        paymentCount: credits.length,
        collectionRate: totalProduction > 0 ? Math.round((totalCollections / totalProduction) * 100) : 0,
      };
    }),

  /** Patient Production — production grouped by patient */
  patientProduction: protectedProcedure
    .input(z.object({ startDate: z.coerce.date(), endDate: z.coerce.date() }))
    .query(async ({ input }) => {
      const treatments = await prisma.treatment.findMany({
        where: { dateTime: { gte: input.startDate, lte: input.endDate } },
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true } },
          operation: { select: { name: true } },
          dentist: { select: { name: true } },
        },
        orderBy: { dateTime: 'asc' },
      });

      const credits = await prisma.credit.findMany({
        where: { dateTime: { gte: input.startDate, lte: input.endDate }, amount: { gt: 0 } },
        include: { patient: { select: { patientId: true } } },
      });

      const patientMap = new Map<number, {
        patientId: number; name: string; production: number; collections: number; count: number;
        treatments: Array<{ date: string; operationName: string; dentistName: string; amount: number }>;
      }>();

      for (const t of treatments) {
        const pid = t.patient.patientId;
        if (!patientMap.has(pid)) {
          patientMap.set(pid, {
            patientId: pid,
            name: `${t.patient.firstName} ${t.patient.lastName ?? ''}`.trim(),
            production: 0, collections: 0, count: 0, treatments: [],
          });
        }
        const p = patientMap.get(pid)!;
        const amt = Number(t.netPrice);
        p.production += amt;
        p.count++;
        p.treatments.push({
          date: t.dateTime ? new Date(t.dateTime).toISOString() : '',
          operationName: t.operation?.name ?? 'Unknown',
          dentistName: t.dentist?.name ?? 'Unknown',
          amount: amt,
        });
      }

      for (const c of credits) {
        const p = patientMap.get(c.patient.patientId);
        if (p) p.collections += Number(c.amount);
      }

      const patients = Array.from(patientMap.values()).sort((a, b) => b.production - a.production);
      const grandTotal = patients.reduce((s, p) => s + p.production, 0);

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        patients,
        grandTotal,
        totalCollections: patients.reduce((s, p) => s + p.collections, 0),
        totalPatients: patients.length,
      };
    }),

  /** Phone List — patient contact directory */
  phoneList: protectedProcedure
    .query(async () => {
      const patients = await prisma.patient.findMany({
        where: { OR: [{ phone: { not: null } }, { mobile: { not: null } }, { email: { not: null } }] },
        select: {
          patientId: true, firstName: true, middleName: true, lastName: true,
          phone: true, mobile: true, email: true, gender: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });

      return {
        patients: patients.map(p => ({
          patientId: p.patientId,
          name: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
          phone: p.phone ?? '',
          mobile: p.mobile ?? '',
          email: p.email ?? '',
          gender: p.gender,
        })),
        total: patients.length,
      };
    }),

  /** Operation List — all operations by section */
  operationList: protectedProcedure
    .query(async () => {
      const sections = await prisma.section.findMany({
        include: {
          operations: {
            orderBy: { pOrder: 'asc' },
            select: { operationId: true, name: true, price: true, pOrder: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      return {
        sections: sections.map((s) => ({
          sectionId: s.sectionId,
          sectionName: s.name,
          operations: s.operations.map((o) => ({
            operationId: o.operationId,
            name: o.name,
            price: Number(o.price),
            sortOrder: o.pOrder,
          })),
          operationCount: s.operations.length,
          totalDefaultValue: s.operations.reduce((sum: number, o) => sum + Number(o.price), 0),
        })),
        totalSections: sections.length,
        totalOperations: sections.reduce((sum: number, sec) => sum + sec.operations.length, 0),
      };
    }),

  /** Receipt List — all payments/credits in a period */
  receiptList: protectedProcedure
    .input(z.object({ startDate: z.coerce.date(), endDate: z.coerce.date() }))
    .query(async ({ input }) => {
      const credits = await prisma.credit.findMany({
        where: { dateTime: { gte: input.startDate, lte: input.endDate } },
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true } },
          voucher: { select: { voucherId: true, voucherType: { select: { name: true } } } },
        },
        orderBy: { dateTime: 'asc' },
      });

      const receipts = credits.map(c => ({
        creditId: c.creditId,
        date: c.dateTime ? new Date(c.dateTime).toISOString() : '',
        patientId: c.patient.patientId,
        patientName: `${c.patient.firstName} ${c.patient.lastName ?? ''}`.trim(),
        amount: Number(c.amount),
        foreignAmount: c.foreignAmount ? Number(c.foreignAmount) : null,
        currencyCode: c.currencyCode,
        creditType: c.creditType === 1 ? 'Payment' : 'Charge',
        notes: c.notes ?? '',
        voucherType: c.voucher?.voucherType?.name ?? '',
      }));

      const totalPayments = receipts.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
      const totalCharges = receipts.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        receipts,
        totalPayments,
        totalCharges,
        netAmount: totalPayments - totalCharges,
        count: receipts.length,
      };
    }),

  /** Daily Appointments Report — appointment list for a specific day */
  dailyAppointments: protectedProcedure
    .input(z.object({ date: z.coerce.date() }))
    .query(async ({ input }) => {
      const start = new Date(input.date); start.setHours(0, 0, 0, 0);
      const end = new Date(input.date); end.setHours(23, 59, 59, 999);

      const appointments = await prisma.appointment.findMany({
        where: { date: { gte: start, lte: end } },
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true, phone: true, mobile: true } },
          dentist: { select: { name: true } },
          appointmentType: { select: { name: true } },
        },
        orderBy: { startTime: 'asc' },
      });

      // Group by dentist
      const dentistMap = new Map<string, typeof appointments>();
      for (const a of appointments) {
        const name = a.dentist?.name ?? 'Unassigned';
        if (!dentistMap.has(name)) dentistMap.set(name, []);
        dentistMap.get(name)!.push(a);
      }

      return {
        date: start.toISOString(),
        byDentist: Array.from(dentistMap.entries()).map(([dentistName, appts]) => ({
          dentistName,
          appointments: appts.map(a => ({
            appointmentId: a.appointmentId,
            time: a.startTime ? new Date(a.startTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '',
            endTime: a.endTime ? new Date(a.endTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '',
            duration: a.duration ?? 30,
            patientName: a.patient ? `${a.patient.firstName} ${a.patient.lastName ?? ''}`.trim() : 'Walk-in',
            phone: a.patient?.phone ?? a.patient?.mobile ?? '',
            type: a.appointmentType?.name ?? '',
            status: a.status ?? 'scheduled',
            notes: a.notes ?? '',
          })),
          count: appts.length,
        })),
        totalAppointments: appointments.length,
        dentistCount: dentistMap.size,
      };
    }),

  /** Treatment List — all treatments in date range with details */
  treatmentList: protectedProcedure
    .input(z.object({ startDate: z.coerce.date(), endDate: z.coerce.date() }))
    .query(async ({ input }) => {
      const treatments = await prisma.treatment.findMany({
        where: { dateTime: { gte: input.startDate, lte: input.endDate } },
        include: {
          patient: { select: { patientId: true, firstName: true, lastName: true } },
          operation: { select: { name: true, price: true } },
          dentist: { select: { name: true } },
          procStatus: { select: { name: true } },
        },
        orderBy: { dateTime: 'asc' },
      });

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        treatments: treatments.map((t) => ({
          treatmentId: t.treatmentId,
          date: t.dateTime ? new Date(t.dateTime).toISOString() : '',
          patientId: t.patient.patientId,
          patientName: `${t.patient.firstName} ${t.patient.lastName ?? ''}`.trim(),
          operationName: t.operation?.name ?? 'Unknown',
          defaultPrice: Number(t.operation?.price ?? 0),
          netPrice: Number(t.netPrice),
          dentistName: t.dentist?.name ?? 'Unknown',
          status: t.procStatus?.name ?? 'Unknown',
          toothId: t.toothId,
          notes: t.notes ?? '',
        })),
        totalCount: treatments.length,
        totalValue: treatments.reduce((s: number, t) => s + Number(t.netPrice), 0),
      };
    }),

  /** List of Accounts — chart of accounts listing */
  listOfAccounts: protectedProcedure
    .query(async () => {
      const accounts = await prisma.account.findMany({
        include: { accountType: true, parentAccount: { select: { name: true } } },
        orderBy: { accountId: 'asc' },
      });

      const byType = new Map<string, typeof accounts>();
      for (const a of accounts) {
        const typeName = a.accountType.name;
        if (!byType.has(typeName)) byType.set(typeName, []);
        byType.get(typeName)!.push(a);
      }

      return {
        byType: Array.from(byType.entries()).map(([typeName, accts]) => ({
          typeName,
          accounts: accts.map((a) => ({
            accountId: a.accountId,
            name: a.name,
            parentName: a.parentAccount?.name ?? null,
            balance: Number(a.balance ?? 0),
            active: a.active,
          })),
          count: accts.length,
          totalBalance: accts.reduce((s: number, a) => s + Number(a.balance ?? 0), 0),
        })),
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter((a) => a.active).length,
      };
    }),

  /** Types of Account — account type listing */
  typesOfAccount: protectedProcedure
    .query(async () => {
      const types = await prisma.accountType.findMany({
        include: { accounts: { select: { accountId: true, balance: true, active: true } } },
        orderBy: { accountTypeId: 'asc' },
      });

      return {
        types: types.map((t) => ({
          accountTypeId: t.accountTypeId,
          name: t.name,
          accountCount: t.accounts.length,
          activeCount: t.accounts.filter((a) => a.active).length,
          totalBalance: t.accounts.reduce((s: number, a) => s + Number(a.balance ?? 0), 0),
        })),
        totalTypes: types.length,
      };
    }),

  /** Division Production — revenue by dentist division */
  divisionProduction: protectedProcedure
    .input(z.object({ startDate: z.coerce.date(), endDate: z.coerce.date() }))
    .query(async ({ input }) => {
      const treatments = await prisma.treatment.findMany({
        where: { dateTime: { gte: input.startDate, lte: input.endDate } },
        include: {
          dentist: { include: { division: true } },
        },
      });

      const divMap = new Map<string, { divisionName: string; production: number; count: number; dentists: Set<string> }>();
      for (const t of treatments) {
        const divName = t.dentist?.division?.name ?? 'Unassigned';
        if (!divMap.has(divName)) divMap.set(divName, { divisionName: divName, production: 0, count: 0, dentists: new Set() });
        const div = divMap.get(divName)!;
        div.production += Number(t.netPrice);
        div.count++;
        if (t.dentist?.name) div.dentists.add(t.dentist.name);
      }

      const divisions = Array.from(divMap.values())
        .map((d) => ({ ...d, dentistCount: d.dentists.size, dentists: undefined }))
        .sort((a, b) => b.production - a.production);

      const grandTotal = divisions.reduce((s: number, d) => s + d.production, 0);

      return {
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        divisions: divisions.map((d) => ({
          ...d,
          percentage: grandTotal > 0 ? Math.round((d.production / grandTotal) * 1000) / 10 : 0,
        })),
        grandTotal,
        totalTreatments: treatments.length,
      };
    }),

  /** Statement Grouped by Treatment — patient statement organized by treatment */
  statementGroupByTreatment: protectedProcedure
    .input(z.object({ patientId: z.number(), startDate: z.coerce.date(), endDate: z.coerce.date() }))
    .query(async ({ input }) => {
      const [patient, treatments, credits] = await Promise.all([
        prisma.patient.findUnique({ where: { patientId: input.patientId }, select: { firstName: true, lastName: true, phone: true } }),
        prisma.treatment.findMany({
          where: { patientId: input.patientId, dateTime: { gte: input.startDate, lte: input.endDate } },
          include: {
            operation: { select: { name: true } },
            dentist: { select: { name: true } },
            distributions: { include: { credit: { select: { dateTime: true, amount: true } } } },
          },
          orderBy: { dateTime: 'asc' },
        }),
        prisma.credit.findMany({
          where: { patientId: input.patientId, dateTime: { gte: input.startDate, lte: input.endDate } },
          orderBy: { dateTime: 'asc' },
        }),
      ]);

      const treatmentRows = treatments.map((t) => {
        const paid = t.distributions.reduce((s: number, d) => s + Number(d.amount), 0);
        return {
          treatmentId: t.treatmentId,
          date: t.dateTime ? new Date(t.dateTime).toISOString() : '',
          operationName: t.operation?.name ?? 'Unknown',
          dentistName: t.dentist?.name ?? 'Unknown',
          toothId: t.toothId,
          amount: Number(t.netPrice),
          paid,
          balance: Number(t.netPrice) - paid,
          payments: t.distributions.map((d) => ({
            date: d.credit.dateTime ? new Date(d.credit.dateTime).toISOString() : '',
            amount: Number(d.amount),
          })),
        };
      });

      const totalTreatments = treatmentRows.reduce((s: number, t) => s + t.amount, 0);
      const totalPaid = treatmentRows.reduce((s: number, t) => s + t.paid, 0);
      const totalCredits = credits.reduce((s: number, c) => s + Number(c.amount), 0);

      return {
        patientId: input.patientId,
        patientName: patient ? `${patient.firstName} ${patient.lastName ?? ''}`.trim() : 'Unknown',
        phone: patient?.phone ?? '',
        fromDate: input.startDate.toISOString(),
        toDate: input.endDate.toISOString(),
        treatments: treatmentRows,
        totalTreatments,
        totalPaid,
        totalCredits,
        balance: totalTreatments - totalCredits,
      };
    }),

  /** Unbalanced Clients — patients with outstanding balances */
  unbalancedClients: protectedProcedure
    .input(z.object({ mode: z.enum(['local', 'foreign']).default('local') }))
    .query(async ({ input }) => {
      const patients = await prisma.patient.findMany({
        select: {
          patientId: true, firstName: true, lastName: true, phone: true, mobile: true,
          treatments: { select: { netPrice: true, foreignNetPrice: true } },
          credits: { select: { amount: true, foreignAmount: true } },
        },
      });

      const unbalanced = patients
        .map((p) => {
          const totalTreatments = p.treatments.reduce(
            (s: number, t) => s + Number(input.mode === 'foreign' ? (t.foreignNetPrice ?? 0) : t.netPrice), 0
          );
          const totalPayments = p.credits.reduce(
            (s: number, c) => s + Number(input.mode === 'foreign' ? (c.foreignAmount ?? 0) : c.amount), 0
          );
          const balance = totalTreatments - totalPayments;
          return {
            patientId: p.patientId,
            name: `${p.firstName} ${p.lastName ?? ''}`.trim(),
            phone: p.phone ?? p.mobile ?? '',
            totalTreatments,
            totalPayments,
            balance,
          };
        })
        .filter((p) => Math.abs(p.balance) > 0.01)
        .sort((a, b) => b.balance - a.balance);

      const totalDebit = unbalanced.filter((p) => p.balance > 0).reduce((s: number, p) => s + p.balance, 0);
      const totalCredit = unbalanced.filter((p) => p.balance < 0).reduce((s: number, p) => s + Math.abs(p.balance), 0);

      return {
        mode: input.mode,
        patients: unbalanced,
        totalPatients: unbalanced.length,
        totalDebit,
        totalCredit,
        netBalance: totalDebit - totalCredit,
      };
    }),

  /** OpSD Production — Operation production cross-tabbed by section and dentist */
  opSDProduction: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input }) => {
      const treatments = await prisma.treatment.findMany({
        where: {
          dateTime: { gte: new Date(input.startDate), lte: new Date(input.endDate + 'T23:59:59') },
        },
        select: {
          netPrice: true,
          operation: { select: { name: true, section: { select: { name: true } } } },
          dentist: { select: { name: true } },
        },
      });

      // Cross-tab: section → dentist → { count, amount }
      const map = new Map<string, Map<string, { count: number; amount: number }>>();
      const dentistSet = new Set<string>();
      let grandTotal = 0;

      for (const t of treatments) {
        const sec = t.operation.section.name;
        const den = t.dentist?.name ?? 'Unassigned';
        const amt = Number(t.netPrice);
        dentistSet.add(den);
        if (!map.has(sec)) map.set(sec, new Map());
        const dMap = map.get(sec)!;
        const cur = dMap.get(den) ?? { count: 0, amount: 0 };
        cur.count++;
        cur.amount += amt;
        dMap.set(den, cur);
        grandTotal += amt;
      }

      const dentists = Array.from(dentistSet).sort();
      const sections = Array.from(map.entries())
        .map(([sectionName, dMap]) => {
          const byDentist = dentists.map((d) => {
            const v = dMap.get(d);
            return { dentistName: d, count: v?.count ?? 0, amount: v?.amount ?? 0 };
          });
          const total = byDentist.reduce((s: number, b) => s + b.amount, 0);
          const count = byDentist.reduce((s: number, b) => s + b.count, 0);
          return { sectionName, byDentist, total, count };
        })
        .sort((a, b) => b.total - a.total);

      return { fromDate: input.startDate, toDate: input.endDate, dentists, sections, grandTotal, totalTreatments: treatments.length };
    }),

  /** Referred-by Production — Production grouped by referral source */
  referredByProduction: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string(), detailed: z.boolean().optional() }))
    .query(async ({ input }) => {
      // Find the "Referred By" PCF tree node
      const refTree = await prisma.pCFTree.findFirst({ where: { name: { contains: 'Referred', mode: 'insensitive' } } });
      const refValues = refTree
        ? await prisma.pCFValue.findMany({ where: { pcfId: refTree.pcfTreeId }, select: { patientId: true, value: true } })
        : [];
      const refMap = new Map(refValues.map((v) => [v.patientId, v.value ?? 'Unknown']));

      const treatments = await prisma.treatment.findMany({
        where: {
          dateTime: { gte: new Date(input.startDate), lte: new Date(input.endDate + 'T23:59:59') },
        },
        select: {
          treatmentId: true,
          patientId: true,
          netPrice: true,
          dateTime: true,
          patient: { select: { firstName: true, lastName: true } },
          operation: { select: { name: true } },
          dentist: { select: { name: true } },
        },
      });

      // Group by referral source
      const grouped = new Map<string, { count: number; amount: number; treatments: any[] }>();
      let grandTotal = 0;

      for (const t of treatments) {
        const source = refMap.get(t.patientId) ?? 'No Referral';
        const amt = Number(t.netPrice);
        if (!grouped.has(source)) grouped.set(source, { count: 0, amount: 0, treatments: [] });
        const g = grouped.get(source)!;
        g.count++;
        g.amount += amt;
        grandTotal += amt;
        if (input.detailed) {
          g.treatments.push({
            date: t.dateTime ? t.dateTime.toISOString() : '',
            patientName: `${t.patient.firstName} ${t.patient.lastName}`,
            operationName: t.operation.name,
            dentistName: t.dentist?.name ?? 'N/A',
            amount: amt,
          });
        }
      }

      const sources = Array.from(grouped.entries())
        .map(([sourceName, g]) => ({
          sourceName,
          count: g.count,
          amount: g.amount,
          percentage: grandTotal > 0 ? Math.round((g.amount / grandTotal) * 1000) / 10 : 0,
          treatments: g.treatments,
        }))
        .sort((a, b) => b.amount - a.amount);

      return { fromDate: input.startDate, toDate: input.endDate, sources, grandTotal, totalTreatments: treatments.length };
    }),

  /** Statement of Account (Receipts only) — Shows only payment/charge transactions */
  statementOfAccountReceipts: protectedProcedure
    .input(z.object({ patientId: z.number(), startDate: z.string().optional(), endDate: z.string().optional() }))
    .query(async ({ input }) => {
      const patient = await prisma.patient.findUniqueOrThrow({
        where: { patientId: input.patientId },
        select: { patientId: true, firstName: true, lastName: true, phone: true, mobile: true },
      });

      const credits = await prisma.credit.findMany({
        where: {
          patientId: input.patientId,
          ...(input.startDate && input.endDate
            ? { dateTime: { gte: new Date(input.startDate), lte: new Date(input.endDate + 'T23:59:59') } }
            : {}),
        },
        select: {
          creditId: true, creditType: true, amount: true, foreignAmount: true, dateTime: true, notes: true,
          voucher: { select: { description: true, voucherType: { select: { name: true } } } },
        },
        orderBy: { dateTime: 'asc' },
      });

      let runningBalance = 0;
      const rows = credits.map((c) => {
        const amt = Number(c.amount);
        const isPayment = c.creditType === 1;
        if (isPayment) runningBalance -= amt;
        else runningBalance += amt;
        return {
          date: c.dateTime ? c.dateTime.toISOString() : '',
          type: isPayment ? 'Payment' : 'Charge',
          description: c.notes ?? c.voucher?.voucherType?.name ?? (isPayment ? 'Payment' : 'Charge'),
          amount: amt,
          foreignAmount: c.foreignAmount ? Number(c.foreignAmount) : null,
          balance: runningBalance,
        };
      });

      const totalPayments = rows.filter((r) => r.type === 'Payment').reduce((s: number, r) => s + r.amount, 0);
      const totalCharges = rows.filter((r) => r.type === 'Charge').reduce((s: number, r) => s + r.amount, 0);

      return {
        patientId: patient.patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        phone: patient.phone ?? patient.mobile ?? '',
        fromDate: input.startDate ?? '',
        toDate: input.endDate ?? '',
        rows,
        totalPayments,
        totalCharges,
        balance: totalCharges - totalPayments,
      };
    }),

  /** Unbalanced Suppliers — Accounts with non-zero balance (suppliers are accounts in DenPro) */
  unbalancedSuppliers: protectedProcedure
    .input(z.object({ mode: z.enum(['local', 'foreign']).optional().default('local') }))
    .query(async () => {
      const accounts = await prisma.account.findMany({
        where: { active: true },
        select: {
          accountId: true, name: true, balance: true,
          accountType: { select: { name: true } },
          vouchers: { select: { amount: true } },
        },
      });

      const unbalanced = accounts
        .map((a) => {
          const bal = Number(a.balance ?? 0);
          const totalVouchers = a.vouchers.reduce((s: number, v) => s + Number(v.amount), 0);
          return {
            accountId: a.accountId,
            name: a.name,
            typeName: a.accountType.name,
            totalVouchers,
            balance: bal,
          };
        })
        .filter((a) => Math.abs(a.balance) > 0.01)
        .sort((a, b) => b.balance - a.balance);

      const totalDebit = unbalanced.filter((a) => a.balance > 0).reduce((s: number, a) => s + a.balance, 0);
      const totalCredit = unbalanced.filter((a) => a.balance < 0).reduce((s: number, a) => s + Math.abs(a.balance), 0);

      return {
        accounts: unbalanced,
        totalAccounts: unbalanced.length,
        totalDebit,
        totalCredit,
        netBalance: totalDebit - totalCredit,
      };
    }),

  /** Patient Production Summary — Condensed version with just totals per patient */
  patientProductionSummary: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input }) => {
      const treatments = await prisma.treatment.findMany({
        where: {
          dateTime: { gte: new Date(input.startDate), lte: new Date(input.endDate + 'T23:59:59') },
        },
        select: {
          netPrice: true,
          patientId: true,
          patient: { select: { firstName: true, lastName: true } },
        },
      });

      const credits = await prisma.credit.findMany({
        where: {
          creditType: 1,
          dateTime: { gte: new Date(input.startDate), lte: new Date(input.endDate + 'T23:59:59') },
        },
        select: { patientId: true, amount: true },
      });

      const creditMap = new Map<number, number>();
      for (const c of credits) {
        creditMap.set(c.patientId, (creditMap.get(c.patientId) ?? 0) + Number(c.amount));
      }

      const patMap = new Map<number, { name: string; production: number; count: number }>();
      for (const t of treatments) {
        const cur = patMap.get(t.patientId) ?? { name: `${t.patient.firstName} ${t.patient.lastName}`, production: 0, count: 0 };
        cur.production += Number(t.netPrice);
        cur.count++;
        patMap.set(t.patientId, cur);
      }

      let totalProduction = 0;
      let totalCollections = 0;
      const patients = Array.from(patMap.entries())
        .map(([patientId, p]) => {
          const collections = creditMap.get(patientId) ?? 0;
          totalProduction += p.production;
          totalCollections += collections;
          return {
            patientId,
            name: p.name,
            treatmentCount: p.count,
            production: p.production,
            collections,
            balance: p.production - collections,
          };
        })
        .sort((a, b) => b.production - a.production);

      return {
        fromDate: input.startDate,
        toDate: input.endDate,
        patients,
        totalPatients: patients.length,
        totalProduction,
        totalCollections,
        totalBalance: totalProduction - totalCollections,
      };
    }),

  /** Recall List — Simple listing of all recall types with patient counts */
  recallList: protectedProcedure
    .input(z.object({}))
    .query(async () => {
      const recalls = await prisma.recall.findMany({
        select: {
          recallId: true,
          name: true,
          intervalDays: true,
          description: true,
          patientRecalls: {
            select: {
              patientRecallId: true,
              dueDate: true,
              completedDate: true,
              status: true,
              patient: { select: { firstName: true, lastName: true, phone: true } },
            },
          },
        },
      });

      const result = recalls.map((r) => ({
        recallId: r.recallId,
        name: r.name,
        intervalDays: r.intervalDays,
        description: r.description,
        totalPatients: r.patientRecalls.length,
        pendingCount: r.patientRecalls.filter((pr) => !pr.completedDate).length,
        completedCount: r.patientRecalls.filter((pr) => pr.completedDate).length,
        patients: r.patientRecalls.map((pr) => ({
          name: `${pr.patient.firstName} ${pr.patient.lastName}`,
          phone: pr.patient.phone ?? '',
          dueDate: pr.dueDate?.toISOString() ?? null,
          completedDate: pr.completedDate?.toISOString() ?? null,
          status: pr.status ?? 0,
        })),
      }));

      return {
        recalls: result,
        totalRecallTypes: result.length,
        totalPatients: result.reduce((s: number, r) => s + r.totalPatients, 0),
      };
    }),
});
