import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { generateAccessToken, generateRefreshToken, hashPassword, comparePassword } from '../middleware/auth';
import { TRPCError } from '@trpc/server';

export const authRouter = router({
  login: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(6),
      })
    )
    .mutation(async (opts) => {
      const user = await opts.ctx.prisma.user.findUnique({
        where: { username: opts.input.username },
      });

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid username or password',
        });
      }

      const passwordMatch = await comparePassword(
        opts.input.password,
        user.passwordHash
      );

      if (!passwordMatch) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid username or password',
        });
      }

      const token = generateAccessToken({
        userId: user.userId,
        username: user.username,
        role: user.role,
      });

      const refreshToken = generateRefreshToken();
      await opts.ctx.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        }
      });

      return {
        token,
        refreshToken,
        user: {
          userId: user.userId,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
        },
      };
    }),

  register: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(6),
        fullName: z.string().min(1),
        role: z.string().default('user'),
      })
    )
    .mutation(async (opts) => {
      const existingUser = await opts.ctx.prisma.user.findUnique({
        where: { username: opts.input.username },
      });

      if (existingUser) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Username already exists',
        });
      }

      const passwordHash = await hashPassword(opts.input.password);

      const newUser = await opts.ctx.prisma.user.create({
        data: {
          username: opts.input.username,
          passwordHash,
          fullName: opts.input.fullName,
          role: opts.input.role,
        },
      });

      const token = generateAccessToken({
        userId: newUser.userId,
        username: newUser.username,
        role: newUser.role,
      });

      const refreshToken = generateRefreshToken();
      await opts.ctx.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: newUser.userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        }
      });

      return {
        token,
        refreshToken,
        user: {
          userId: newUser.userId,
          username: newUser.username,
          fullName: newUser.fullName,
          role: newUser.role,
        },
      };
    }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async (opts) => {
      const rt = await opts.ctx.prisma.refreshToken.findUnique({
        where: { token: opts.input.refreshToken },
        include: { user: true }
      });

      if (!rt || rt.revoked || rt.expiresAt < new Date()) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired refresh token',
        });
      }

      await opts.ctx.prisma.refreshToken.update({
        where: { id: rt.id },
        data: { revoked: true }
      });

      const token = generateAccessToken({
        userId: rt.user.userId,
        username: rt.user.username,
        role: rt.user.role,
      });

      const newRefreshToken = generateRefreshToken();
      await opts.ctx.prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: rt.user.userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        }
      });

      return {
        token,
        refreshToken: newRefreshToken,
        user: {
          userId: rt.user.userId,
          username: rt.user.username,
          fullName: rt.user.fullName,
          role: rt.user.role,
        },
      };
    }),

  me: protectedProcedure.query(async (opts) => {
    const user = await opts.ctx.prisma.user.findUnique({
      where: { userId: opts.ctx.user!.userId },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      userId: user.userId,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    };
  }),

  changePassword: protectedProcedure
    .input(
      z.object({
        oldPassword: z.string().min(6),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async (opts) => {
      const user = await opts.ctx.prisma.user.findUnique({
        where: { userId: opts.ctx.user!.userId },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const passwordMatch = await comparePassword(
        opts.input.oldPassword,
        user.passwordHash
      );

      if (!passwordMatch) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Old password is incorrect',
        });
      }

      const newPasswordHash = await hashPassword(opts.input.newPassword);

      await opts.ctx.prisma.user.update({
        where: { userId: user.userId },
        data: { passwordHash: newPasswordHash },
      });

      return { success: true };
    }),
});
