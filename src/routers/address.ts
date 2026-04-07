import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const addressRouter = router({
  getByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async (opts) => {
      return opts.ctx.prisma.address.findMany({
        where: { patientId: opts.input.patientId },
        include: { country: true },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        countryId: z.number().optional(),
      })
    )
    .mutation(async (opts) => {
      return opts.ctx.prisma.address.create({
        data: {
          patientId: opts.input.patientId,
          street: opts.input.street,
          city: opts.input.city,
          state: opts.input.state,
          zip: opts.input.zip,
          countryId: opts.input.countryId,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        addressId: z.number(),
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        countryId: z.number().optional(),
      })
    )
    .mutation(async (opts) => {
      const address = await opts.ctx.prisma.address.findUnique({
        where: { addressId: opts.input.addressId },
      });

      if (!address) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Address not found',
        });
      }

      return opts.ctx.prisma.address.update({
        where: { addressId: opts.input.addressId },
        data: {
          street: opts.input.street,
          city: opts.input.city,
          state: opts.input.state,
          zip: opts.input.zip,
          countryId: opts.input.countryId,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ addressId: z.number() }))
    .mutation(async (opts) => {
      await opts.ctx.prisma.address.delete({
        where: { addressId: opts.input.addressId },
      });
      return { success: true };
    }),
});
