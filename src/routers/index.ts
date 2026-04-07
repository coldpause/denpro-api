import { router } from '../trpc';
import { addressRouter } from './address';
import { allergyRouter } from './allergy';
import { authRouter } from './auth';
import { dashboardRouter } from './dashboard';
import { diseaseRouter } from './disease';
import { patientRouter } from './patient';
import { familyRouter } from './family';
import { dentistRouter } from './dentist';
import { appointmentRouter } from './appointment';
import { treatmentRouter } from './treatment';
import { operationRouter } from './operation';
import { pcfRouter } from './pcf';
import { sectionRouter } from './section';
import { financialRouter } from './financial';
import { prescriptionRouter } from './prescription';
import { recallRouter } from './recall';
import { imagingRouter } from './imaging';
import { reportRouter } from './report';
import { settingsRouter } from './settings';
import { phonebookRouter } from './phonebook';
import { toothMemoRouter } from './toothMemo';
import { auditLogRouter } from './auditLog';
import { searchRouter } from './search';
import { calendarSyncRouter } from './calendarSync';
import { roomRouter } from './room';
import { dentalChartRouter } from './dentalChart';
import { newPatientRouter } from './newPatient';

export const appRouter = router({
  address: addressRouter,
  allergy: allergyRouter,
  auth: authRouter,
  dashboard: dashboardRouter,
  disease: diseaseRouter,
  patient: patientRouter,
  family: familyRouter,
  dentist: dentistRouter,
  appointment: appointmentRouter,
  treatment: treatmentRouter,
  operation: operationRouter,
  pcf: pcfRouter,
  section: sectionRouter,
  financial: financialRouter,
  prescription: prescriptionRouter,
  recall: recallRouter,
  imaging: imagingRouter,
  report: reportRouter,
  settings: settingsRouter,
  phonebook: phonebookRouter,
  toothMemo: toothMemoRouter,
  auditLog: auditLogRouter,
  search: searchRouter,
  calendarSync: calendarSyncRouter,
  room: roomRouter,
  dentalChart: dentalChartRouter,
  newPatient: newPatientRouter,
});

export type AppRouter = typeof appRouter;
