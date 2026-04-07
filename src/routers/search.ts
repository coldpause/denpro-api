/**
 * Search Router — global search across patients, appointments, operations
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

export const searchRouter = router({
  global: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().int().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, limit } = input;

      const [patients, appointments, operations] = await Promise.all([
        // Search patients by name, phone, ID
        ctx.prisma.patient.findMany({
          where: {
            OR: [
              { firstName: { contains: query, mode: 'insensitive' } },
              { lastName: { contains: query, mode: 'insensitive' } },
              { middleName: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query, mode: 'insensitive' } },
              { mobile: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          },
          select: {
            patientId: true,
            firstName: true,
            lastName: true,
            middleName: true,
            phone: true,
            mobile: true,
          },
          take: limit,
          orderBy: { lastName: 'asc' },
        }),

        // Search upcoming appointments (include patient name)
        ctx.prisma.appointment.findMany({
          where: {
            AND: [
              { date: { gte: new Date() } },
              {
                OR: [
                  { notes: { contains: query, mode: 'insensitive' } },
                  { patient: { firstName: { contains: query, mode: 'insensitive' } } },
                  { patient: { lastName: { contains: query, mode: 'insensitive' } } },
                ],
              },
            ],
          },
          select: {
            appointmentId: true,
            date: true,
            duration: true,
            notes: true,
            status: true,
            patient: {
              select: { patientId: true, firstName: true, lastName: true },
            },
            dentist: {
              select: { dentistId: true, name: true },
            },
          },
          take: limit,
          orderBy: { date: 'asc' },
        }),

        // Search operations (procedure catalog)
        ctx.prisma.operation.findMany({
          where: {
            name: { contains: query, mode: 'insensitive' },
          },
          select: {
            operationId: true,
            name: true,
            price: true,
            section: { select: { sectionId: true, name: true } },
          },
          take: limit,
          orderBy: { name: 'asc' },
        }),
      ]);

      return {
        patients,
        appointments,
        operations,
        totalResults: patients.length + appointments.length + operations.length,
      };
    }),
});
