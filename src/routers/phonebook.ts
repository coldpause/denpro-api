/**
 * PhoneBook Router — Contact directory (linked to patients or standalone)
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const phonebookInclude = {
  patient: {
    select: { patientId: true, firstName: true, lastName: true },
  },
  account: {
    select: { accountId: true, name: true },
  },
};

export const phonebookRouter = router({
  /** List phonebook entries (paginated) */
  list: protectedProcedure
    .input(
      z.object({
        skip: z.number().default(0),
        take: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const [contacts, total] = await Promise.all([
        prisma.phoneBook.findMany({
          skip: input.skip,
          take: input.take,
          orderBy: { name: 'asc' },
          include: phonebookInclude,
        }),
        prisma.phoneBook.count(),
      ]);

      return { contacts, total };
    }),

  /** Search phonebook by name, phone, email, company */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      return prisma.phoneBook.findMany({
        where: {
          OR: [
            { name: { contains: input.query, mode: 'insensitive' } },
            { phone: { contains: input.query, mode: 'insensitive' } },
            { mobile: { contains: input.query, mode: 'insensitive' } },
            { email: { contains: input.query, mode: 'insensitive' } },
            { company: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        take: input.limit,
        orderBy: { name: 'asc' },
        include: phonebookInclude,
      });
    }),

  /** Get a single phonebook entry */
  getById: protectedProcedure
    .input(z.object({ phoneBookId: z.number() }))
    .query(async ({ input }) => {
      return prisma.phoneBook.findUniqueOrThrow({
        where: { phoneBookId: input.phoneBookId },
        include: phonebookInclude,
      });
    }),

  /** Create a phonebook entry */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        mobile: z.string().optional(),
        email: z.string().optional(),
        company: z.string().optional(),
        notes: z.string().optional(),
        patientId: z.number().optional(),
        accountId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.phoneBook.create({
        data: {
          name: input.name,
          phone: input.phone ?? null,
          mobile: input.mobile ?? null,
          email: input.email ?? null,
          company: input.company ?? null,
          notes: input.notes ?? null,
          patientId: input.patientId ?? null,
          accountId: input.accountId ?? null,
        },
        include: phonebookInclude,
      });
    }),

  /** Update a phonebook entry */
  update: protectedProcedure
    .input(
      z.object({
        phoneBookId: z.number(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        mobile: z.string().optional(),
        email: z.string().optional(),
        company: z.string().optional(),
        notes: z.string().optional(),
        patientId: z.number().nullable().optional(),
        accountId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { phoneBookId, ...data } = input;
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.mobile !== undefined) updateData.mobile = data.mobile;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.company !== undefined) updateData.company = data.company;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.patientId !== undefined) updateData.patientId = data.patientId;
      if (data.accountId !== undefined) updateData.accountId = data.accountId;

      return prisma.phoneBook.update({
        where: { phoneBookId },
        data: updateData,
        include: phonebookInclude,
      });
    }),

  /** Delete a phonebook entry */
  delete: protectedProcedure
    .input(z.object({ phoneBookId: z.number() }))
    .mutation(async ({ input }) => {
      return prisma.phoneBook.delete({
        where: { phoneBookId: input.phoneBookId },
      });
    }),
});
