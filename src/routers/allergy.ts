/**
 * Patient Allergy Router
 *
 * Manages per-patient allergy tracking.
 * Unlike diseases (which reference a global lookup), allergies are free-text per patient.
 * Original MFC: CPatientAllergySet
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

export const allergyRouter = router({
  /**
   * Get allergies for a specific patient
   */
  getByPatient: protectedProcedure
    .input(z.object({ patientId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.patientAllergy.findMany({
        where: { patientId: input.patientId },
        orderBy: { patientAllergyId: 'asc' },
      });
    }),

  /**
   * Add an allergy to a patient
   */
  add: protectedProcedure
    .input(
      z.object({
        patientId: z.number().int(),
        allergyName: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.patientAllergy.create({
        data: input,
      });
    }),

  /**
   * Update an allergy name
   */
  update: protectedProcedure
    .input(
      z.object({
        patientAllergyId: z.number().int(),
        allergyName: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientAllergyId, ...data } = input;
      return ctx.prisma.patientAllergy.update({
        where: { patientAllergyId },
        data,
      });
    }),

  /**
   * Remove an allergy from a patient
   */
  remove: protectedProcedure
    .input(z.object({ patientAllergyId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.patientAllergy.delete({
        where: { patientAllergyId: input.patientAllergyId },
      });
    }),
});
