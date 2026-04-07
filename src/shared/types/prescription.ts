export interface Medicine {
  medicineId: number;
  name: string;
  defaultDosage: string | null;
  defaultInstructions: string | null;
  active: boolean; // Field we added previously
}

export interface PrescriptionDetail {
  rxDetailId: number;
  prescriptionId: number;
  medicineId: number;
  dosage: string | null;
  instructions: string | null;
  quantity: string | null;
  medicine?: Medicine;
}

export interface Prescription {
  prescriptionId: number;
  patientId: number;
  dentistId: number | null;
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  details?: PrescriptionDetail[];
  dentist?: { dentistId: number; firstName: string; lastName: string };
}
