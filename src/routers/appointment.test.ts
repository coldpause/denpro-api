import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestCaller, testPrisma } from '../test/testUtils';

// Mock Prisma
// @ts-ignore
vi.mock('../test/testUtils', async (importOriginal) => {
  // @ts-ignore
  const actual = await importOriginal<typeof import('../test/testUtils')>();
  return {
    ...actual,
    testPrisma: {
      appointment: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
    },
  };
});

describe('appointment router', () => {
  const mockDentistUser = { userId: 1, username: 'dr', role: 'dentist' };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates an appointment when no conflict', async () => {
      vi.mocked(testPrisma.appointment.findMany).mockResolvedValueOnce([]); // no conflicts
      
      const mockAppt = { appointmentId: 100, patientId: 1, dentistId: 2 };
      vi.mocked(testPrisma.appointment.create).mockResolvedValueOnce(mockAppt as any);

      const caller = createTestCaller(mockDentistUser);
      const result = await caller.appointment.create({
        patientId: 1,
        dentistId: 2,
        appointmentTypeId: 1,
        date: new Date('2026-04-02T10:00:00Z'),
        duration: 30
      });

      expect(result.appointmentId).toBe(100);
      expect(testPrisma.appointment.findMany).toHaveBeenCalled();
      expect(testPrisma.appointment.create).toHaveBeenCalled();
    });

    it('detects conflict and throws BAD_REQUEST if time overlaps', async () => {
      // Simulate conflict
      vi.mocked(testPrisma.appointment.findMany).mockResolvedValueOnce([{ appointmentId: 99 }] as any);

      const caller = createTestCaller(mockDentistUser);
      await expect(
        caller.appointment.create({
          patientId: 1,
          dentistId: 2,
          appointmentTypeId: 1,
          date: new Date('2026-04-02T10:00:00Z'),
          duration: 30
        })
      ).rejects.toThrowError(/Dentist already has an appointment/);
    });
  });

  describe('getWaitingRoom', () => {
    it('returns arrived and in-treatment appointments', async () => {
      const mockList = [{ appointmentId: 1, status: 1 }];
      vi.mocked(testPrisma.appointment.findMany).mockResolvedValueOnce(mockList as any);

      const caller = createTestCaller(mockDentistUser);
      const result = await caller.appointment.getWaitingRoom({});

      expect(result).toEqual(mockList);
    });
  });
});
