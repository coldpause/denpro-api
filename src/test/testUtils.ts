import { PrismaClient } from '@prisma/client';
import { appRouter } from '../routers';
import { createCallerFactory, Context, User } from '../trpc';

// We share a single Prisma instance for tests
export const testPrisma = new PrismaClient();

const createCaller = createCallerFactory(appRouter);

export const createTestCaller = (user?: User) => {
  return createCaller({
    prisma: testPrisma,
    user,
  });
};
