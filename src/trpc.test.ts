import { describe, it, expect } from 'vitest';
import { adminProcedure, dentistProcedure, createContext } from './trpc';
import { TRPCError } from '@trpc/server';

describe('RBAC Middleware (trpc.ts)', () => {

  const createMockOpts = (role: string | null) => {
    return {
      ctx: {
        prisma: {} as any,
        user: role ? { userId: 1, username: 'test', role } : undefined
      },
      next: (val: any) => Promise.resolve(val),
      path: 'testProcedure',
      type: 'query' as const,
      rawInput: undefined
    };
  };

  describe('adminProcedure', () => {
    it('allows admin users', async () => {
      const opts = createMockOpts('admin');
      // @ts-ignore - bypassing full internal tRPC opts type
      const result = await adminProcedure._def.middlewares[0](opts as any);
      expect(result).toBeDefined();
    });

    it('blocks dentist users', async () => {
      const opts = createMockOpts('dentist');
      // @ts-ignore
      await expect(adminProcedure._def.middlewares[0](opts as any)).rejects.toThrowError(
        'This action requires at least "admin" role. Your role: "dentist"'
      );
    });

    it('blocks unauthenticated users', async () => {
      const opts = createMockOpts(null);
      // @ts-ignore
      await expect(adminProcedure._def.middlewares[0](opts as any)).rejects.toThrowError(
        'You must be logged in to access this resource'
      );
    });
  });

  describe('dentistProcedure', () => {
    it('allows dentist users', async () => {
      const opts = createMockOpts('dentist');
      // @ts-ignore
      const result = await dentistProcedure._def.middlewares[0](opts as any);
      expect(result).toBeDefined();
    });

    it('allows admin users (higher level)', async () => {
      const opts = createMockOpts('admin');
      // @ts-ignore
      const result = await dentistProcedure._def.middlewares[0](opts as any);
      expect(result).toBeDefined();
    });

    it('blocks normal users', async () => {
      const opts = createMockOpts('user');
      // @ts-ignore
      await expect(dentistProcedure._def.middlewares[0](opts as any)).rejects.toThrowError(
        'This action requires at least "dentist" role. Your role: "user"'
      );
    });
  });
});
