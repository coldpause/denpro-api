export interface Section {
  sectionId: number;
  name: string;
  description: string | null;
  sortOrder: number | null;
}

export interface Operation {
  operationId: number;
  name: string;
  sectionId: number;
  graphId: number | null;
  price: number;
  foreignPrice: number | null;
  color: number | null;
  colorEx: number | null;
  pOrder: number | null;
}

export interface Treatment {
  treatmentId: number;
  patientId: number;
  operationId: number;
  dentistId: number | null;
  toothId: number | null;
  tooth2Id: number | null;
  surfaces: string | null;
  procStatusId: number;
  dateTime: string | Date;
  netPrice: number | string;
  foreignNetPrice: number | string | null;
  exchangeRate: number | string | null;
  plan: string | null;
  notes: string | null;
}

export interface ProcStatus {
  procStatusId: number;
  name: string;
  description: string | null;
}
