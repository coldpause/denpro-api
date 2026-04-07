import { CreditType, CreditStatus } from './enums.js';

export interface Account {
  accountId: number;
  name: string;
  accountTypeId: number;
  parentAccountId: number | null;
  balance: number | null;
  active: boolean;
}

export interface AccountType {
  accountTypeId: number;
  name: string;
}

export interface Credit {
  creditId: number;
  patientId: number;
  creditType: CreditType | number;
  amount: number;
  foreignAmount: number | null;
  exchangeRate: number | null;
  currencyCode: string | null;
  status: CreditStatus | number;
  dateTime: string | Date;
  notes: string | null;
  voucherId: number | null;
}

export interface Distribution {
  distributionId: number;
  creditId: number;
  treatmentId: number | null;
  patientId: number;
  amount: number;
}

export interface Voucher {
  voucherId: number;
  voucherTypeId: number;
  date: string | Date;
  amount: number;
  description: string | null;
  accountId: number | null;
}

export interface VoucherType {
  voucherTypeId: number;
  name: string;
}
