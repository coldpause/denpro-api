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
      patient: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

describe('patient router', () => {
  const mockDentistUser = { userId: 1, username: 'dr', role: 'dentist' };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated patients', async () => {
      const mockPatients = [{ patientId: 1, firstName: 'John' }];
      vi.mocked(testPrisma.patient.findMany).mockResolvedValueOnce(mockPatients as any);
      vi.mocked(testPrisma.patient.count).mockResolvedValueOnce(1);

      const caller = createTestCaller(mockDentistUser);
      const result = await caller.patient.list({ skip: 0, take: 10 });

      expect(result.patients).toEqual(mockPatients);
      expect(result.total).toBe(1);
    });
  });

  describe('create', () => {
    it('creates a new patient and updates family id if head of family', async () => {
      const mockPatient = { patientId: 10, firstName: 'Jane', patientType: 1 };
      vi.mocked(testPrisma.patient.create).mockResolvedValueOnce(mockPatient as any);
      vi.mocked(testPrisma.patient.update).mockResolvedValueOnce(mockPatient as any);

      const caller = createTestCaller(mockDentistUser);
      const result = await caller.patient.create({
        firstName: 'Jane',
        patientType: 1
      });

      expect(result.patientId).toBe(10);
      expect(testPrisma.patient.create).toHaveBeenCalled();
      expect(testPrisma.patient.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { patientId: 10 },
        data: { familyId: 10 }
      }));
    });
  });

  describe('archive', () => {
    it('sets absent to true', async () => {
      vi.mocked(testPrisma.patient.findUnique).mockResolvedValueOnce({ patientId: 5 } as any);
      vi.mocked(testPrisma.patient.update).mockResolvedValueOnce({ patientId: 5, absent: true } as any);

      const caller = createTestCaller(mockDentistUser);
      const result = await caller.patient.archive({ patientId: 5 });

      expect(result.success).toBe(true);
      expect(testPrisma.patient.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { patientId: 5 },
        data: { absent: true }
      }));
    });
  });

  describe('search', () => {
    it('searches for patients based on query', async () => {
      const mockPatients = [{ patientId: 1, firstName: 'SearchTerm' }];
      vi.mocked(testPrisma.patient.findMany).mockResolvedValueOnce(mockPatients as any);

      const caller = createTestCaller(mockDentistUser);
      const result = await caller.patient.search({ query: 'SearchTerm', limit: 10 });

      expect(result.length).toBe(1);
      expect(testPrisma.patient.findMany).toHaveBeenCalled();
    });
  });
});
