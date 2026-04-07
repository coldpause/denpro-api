import { initTRPC, TRPCError } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { PrismaClient } from '@prisma/client';
import { verifyToken } from './middleware/auth';

const prisma = new PrismaClient();

export interface User {
  userId: number;
  username: string;
  role: string;
}

export interface Context {
  prisma: PrismaClient;
  user?: User;
}

export const createContext = async (
  opts: CreateExpressContextOptions
): Promise<Context> => {
  const token = opts.req.headers.authorization?.replace('Bearer ', '');
  let user: User | undefined;

  if (token) {
    try {
      const payload = verifyToken(token);
      user = {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      };
    } catch (error) {
      console.error('Token verification failed:', error);
    }
  }

  return {
    prisma,
    user,
  };
};

const t = initTRPC.context<typeof createContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
export const middleware = t.middleware;

/**
 * Requires valid JWT token (any role)
 */
export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }
  return opts.next({
    ctx: {
      ...opts.ctx,
      user: opts.ctx.user,
    },
  });
});

/**
 * Role hierarchy: admin > dentist > user
 * admin can do everything, dentist can do clinical + user tasks, user can do basic tasks
 */
const ROLE_HIERARCHY: Record<string, number> = {
  admin: 100,
  dentist: 50,
  user: 10,
};

function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

/**
 * Factory: creates a procedure that requires a minimum role level.
 * Higher roles automatically have access.
 */
function createRoleProcedure(minRole: string) {
  const minLevel = getRoleLevel(minRole);
  return t.procedure.use(async (opts) => {
    if (!opts.ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource',
      });
    }
    const userLevel = getRoleLevel(opts.ctx.user.role);
    if (userLevel < minLevel) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `This action requires at least "${minRole}" role. Your role: "${opts.ctx.user.role}"`,
      });
    }
    return opts.next({
      ctx: {
        ...opts.ctx,
        user: opts.ctx.user,
      },
    });
  });
}

/**
 * Requires admin role
 * Use for: settings, user management, PCF tree admin, disease list admin
 */
export const adminProcedure = createRoleProcedure('admin');

/**
 * Requires dentist or admin role
 * Use for: creating/editing treatments, prescriptions, clinical data
 */
export const dentistProcedure = createRoleProcedure('dentist');
