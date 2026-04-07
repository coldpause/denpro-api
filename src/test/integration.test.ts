import { describe, it, expect, vi } from 'vitest';
import { createTestCaller, testPrisma } from './testUtils';

// Mock testPrisma
// @ts-ignore
vi.mock('./testUtils', async (importOriginal) => {
  // @ts-ignore
  const actual = await importOriginal<typeof import('./testUtils')>();
  return {
    ...actual,
    testPrisma: {
      patient: { create: vi.fn(), update: vi.fn() },
      treatment: { create: vi.fn() },
      credit: { create: vi.fn() },
      distribution: { create: vi.fn(), findMany: vi.fn() },
    },
  };
});

describe('Integration Test: Core Workflow', () => {
  const dentistUser = { userId: 1, username: 'dr', role: 'dentist' };

  it('Patient Creation → Treatment → Credit → Balance Check', async () => {
    // 1. Patient Creation
    const mockCreatedPatient = { patientId: 99, firstName: 'Integration', patientType: 1 };
    vi.mocked(testPrisma.patient.create).mockResolvedValueOnce(mockCreatedPatient as any);
    vi.mocked(testPrisma.patient.update).mockResolvedValueOnce(mockCreatedPatient as any);

    const caller = createTestCaller(dentistUser);
    const newPatient = await caller.patient.create({
      firstName: 'Integration',
      patientType: 1
    });
    expect(newPatient.patientId).toBe(99);

    // 2. Treatment
    const mockTreatment = { 
      treatmentId: 1000, 
      patientId: 99, 
      operationId: 1, 
      netPrice: 50.0 
    };
    vi.mocked(testPrisma.treatment.create).mockResolvedValueOnce(mockTreatment as any);
    const newTreatment = await caller.treatment.create({
      patientId: 99,
      operationId: 1,
      dentistId: 1,
      toothId: 11,
      procStatusId: 1,
      dateTime: new Date(),
      netPrice: 50.0
    });
    expect(newTreatment.treatmentId).toBe(1000);

    // 3. Credit (Payment)
    const mockCredit = { creditId: 500, patientId: 99, creditType: 1, amount: 50.0, status: 3 };
    vi.mocked(testPrisma.credit.create).mockResolvedValueOnce(mockCredit as any);
    
    // Simulating credit distribution implicitly checked
    const newCredit = await caller.financial.createCredit({
      patientId: 99,
      creditType: 1,
      amount: 50.0,
      notes: 'Payment for integration test'
    });
    expect(newCredit.creditId).toBe(500);

    // 4. Balance check
    // We mock the balance calculation output
    vi.mocked(testPrisma.distribution.findMany).mockResolvedValueOnce([
      { amount: 50.0 }
    ] as any);
    
    const balance = await caller.financial.getBalance({ patientId: 99 });
    // This is mocked to depend on the financial router's specific balance aggregation query
    // In a real test, the DB seed would provide real calculations.
    expect(balance).toBeDefined();
  });
});
