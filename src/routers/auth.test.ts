import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestCaller, testPrisma } from '../test/testUtils';
import * as authMiddleware from '../middleware/auth';

// Mock middleware
vi.mock('../middleware/auth', () => ({
  generateAccessToken: vi.fn(),
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

// Mock Prisma
// @ts-ignore
vi.mock('../test/testUtils', async (importOriginal) => {
  // @ts-ignore
  const actual = await importOriginal<typeof import('../test/testUtils')>();
  return {
    ...actual,
    testPrisma: {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

describe('auth router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('returns token and user on right credentials', async () => {
      const mockUser = {
        userId: 1,
        username: 'test_user',
        passwordHash: 'hashed_pw',
        fullName: 'Test User',
        role: 'user',
      };
      
      vi.mocked(testPrisma.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(authMiddleware.comparePassword).mockResolvedValueOnce(true);
      vi.mocked(authMiddleware.generateAccessToken).mockReturnValueOnce('fake-jwt-token');

      const caller = createTestCaller();
      const result = await caller.auth.login({
        username: 'test_user',
        password: 'correct_password',
      });

      expect(result.token).toBe('fake-jwt-token');
      expect(result.user).toMatchObject({
        userId: 1,
        username: 'test_user',
        fullName: 'Test User',
        role: 'user',
      });
      expect(authMiddleware.generateAccessToken).toHaveBeenCalledWith({
        userId: 1,
        username: 'test_user',
        role: 'user',
      });
    });

    it('throws UNAUTHORIZED for wrong username', async () => {
      vi.mocked(testPrisma.user.findUnique).mockResolvedValueOnce(null);

      const caller = createTestCaller();
      await expect(
        caller.auth.login({ username: 'unknown', password: 'pwd' })
      ).rejects.toThrowError(/Invalid username or password/);
    });
  });

  describe('register', () => {
    it('creates a new user and returns token', async () => {
      vi.mocked(testPrisma.user.findUnique).mockResolvedValueOnce(null);
      vi.mocked(authMiddleware.hashPassword).mockResolvedValueOnce('hashed_pw');
      vi.mocked(testPrisma.user.create).mockResolvedValueOnce({
        userId: 2,
        username: 'new_user',
        passwordHash: 'hashed_pw',
        fullName: 'New User',
        role: 'user',
      } as any);
      vi.mocked(authMiddleware.generateAccessToken).mockReturnValueOnce('new-jwt');

      const caller = createTestCaller();
      const result = await caller.auth.register({
        username: 'new_user',
        password: 'mypassword',
        fullName: 'New User',
        role: 'user'
      });

      expect(result.token).toBe('new-jwt');
      expect(result.user.username).toBe('new_user');
      expect(testPrisma.user.create).toHaveBeenCalled();
    });

    it('throws BAD_REQUEST if username exists', async () => {
      vi.mocked(testPrisma.user.findUnique).mockResolvedValueOnce({} as any);

      const caller = createTestCaller();
      await expect(
        caller.auth.register({
          username: 'exists',
          password: 'pwd',
          fullName: 'Name'
        })
      ).rejects.toThrowError(/Username already exists/);
    });
  });
});
