import { PatientType } from './enums.js';

export interface Patient {
  patientId: number;
  familyId: number | null;
  patientType: PatientType | number;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: Date | string | null;
  gender: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  pedo: boolean;
  absent: boolean;
  notes: string | null;
  nickName?: string | null;
  criticalProblems?: string | null;
  privateNotes?: string | null;
  referredBy?: string | null;
  referredTo?: string | null;
  passToken?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Address {
  addressId: number;
  patientId: number;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  countryId: number | null;
  phone?: string | null;
  cellular?: string | null;
}

export interface PhoneBook {
  phoneBookId: number;
  patientId: number;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
}
