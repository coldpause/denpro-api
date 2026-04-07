/**
 * Calendar Sync Router
 *
 * Manages calendar feed tokens for iCal subscription.
 * Allows creating per-dentist or clinic-wide feeds that
 * Google Calendar, Apple Calendar, or Outlook can subscribe to.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';

/**
 * Generate a URL-safe random token for calendar feed URLs.
 */
function generateFeedToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export const calendarSyncRouter = router({
  /**
   * List all active calendar feed tokens.
   * Admin sees all; others see only their own.
   */
  listFeeds: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.user.role === 'admin';

    return ctx.prisma.calendarFeedToken.findMany({
      where: isAdmin ? {} : { createdBy: ctx.user.userId },
      include: {
        dentist: { select: { dentistId: true, name: true } },
        user: { select: { userId: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }),

  /**
   * Create a new calendar feed token.
   * Returns the full subscription URL.
   */
  createFeed: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(100),
        dentistId: z.number().int().optional(), // null = all dentists
        daysAhead: z.number().int().min(7).max(365).default(90),
        daysBehind: z.number().int().min(0).max(90).default(7),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify dentist exists if specified
      if (input.dentistId) {
        const dentist = await ctx.prisma.dentist.findUnique({
          where: { dentistId: input.dentistId },
        });
        if (!dentist) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Dentist not found',
          });
        }
      }

      const token = generateFeedToken();

      const feed = await ctx.prisma.calendarFeedToken.create({
        data: {
          token,
          label: input.label,
          dentistId: input.dentistId || null,
          createdBy: ctx.user.userId,
          daysAhead: input.daysAhead,
          daysBehind: input.daysBehind,
        },
        include: {
          dentist: { select: { dentistId: true, name: true } },
        },
      });

      return {
        ...feed,
        // The subscription URL — this is what the user gives to their calendar app
        subscriptionUrl: `/cal/${token}`,
        downloadUrl: `/cal/${token}/download`,
      };
    }),

  /**
   * Revoke (deactivate) a calendar feed token.
   * The feed URL will stop working immediately.
   */
  revokeFeed: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const feed = await ctx.prisma.calendarFeedToken.findUnique({
        where: { id: input.id },
      });

      if (!feed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feed not found' });
      }

      // Only admin or the creator can revoke
      if (ctx.user.role !== 'admin' && feed.createdBy !== ctx.user.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot revoke this feed' });
      }

      return ctx.prisma.calendarFeedToken.update({
        where: { id: input.id },
        data: { active: false },
      });
    }),

  /**
   * Reactivate a previously revoked feed.
   */
  reactivateFeed: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const feed = await ctx.prisma.calendarFeedToken.findUnique({
        where: { id: input.id },
      });

      if (!feed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feed not found' });
      }

      if (ctx.user.role !== 'admin' && feed.createdBy !== ctx.user.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify this feed' });
      }

      return ctx.prisma.calendarFeedToken.update({
        where: { id: input.id },
        data: { active: true },
      });
    }),

  /**
   * Regenerate the token for an existing feed (invalidates old URL, creates new one).
   * Use when you suspect the URL has been leaked.
   */
  regenerateToken: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const feed = await ctx.prisma.calendarFeedToken.findUnique({
        where: { id: input.id },
      });

      if (!feed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feed not found' });
      }

      if (ctx.user.role !== 'admin' && feed.createdBy !== ctx.user.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify this feed' });
      }

      const newToken = generateFeedToken();

      const updated = await ctx.prisma.calendarFeedToken.update({
        where: { id: input.id },
        data: { token: newToken },
        include: {
          dentist: { select: { dentistId: true, name: true } },
        },
      });

      return {
        ...updated,
        subscriptionUrl: `/cal/${newToken}`,
        downloadUrl: `/cal/${newToken}/download`,
      };
    }),

  /**
   * Delete a feed token permanently.
   */
  deleteFeed: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.calendarFeedToken.delete({
        where: { id: input.id },
      });
    }),
});
