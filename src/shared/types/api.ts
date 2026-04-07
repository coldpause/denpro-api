import type { Patient, Address, PhoneBook } from './patient.js';
import type { Treatment } from './treatment.js';
import type { Appointment } from './appointment.js';

export interface ApiAddress extends Address {}
export interface ApiPhoneBook extends PhoneBook {}

export interface ApiTreatment extends Treatment {
  netPrice: string | number;
  operation?: { operationId: number; name: string };
}

export interface ApiAppointment extends Appointment {}

export interface ApiPatientDisease {
  patientDiseaseId: number;
  disease: { diseaseId: number; name: string; description: string | null };
}

export interface ApiPatientAllergy {
  patientAllergyId: number;
  allergyName: string | null;
}

export interface ApiPatient extends Patient {
  addresses: ApiAddress[];
  phoneBooks?: ApiPhoneBook[];
  treatments?: ApiTreatment[];
  appointments?: ApiAppointment[];
  patientDiseases?: ApiPatientDisease[];
  patientAllergies?: ApiPatientAllergy[];
}

export interface PatientListResponse {
  patients: ApiPatient[];
  total: number;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    userId: number;
    username: string;
    fullName: string;
    role: string;
  };
}

export interface FamilyMembersResponse {
  familyId: number;
  members: ApiPatient[];
}
