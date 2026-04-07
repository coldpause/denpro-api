export interface Appointment {
  appointmentId: number;
  patientId: number | null;
  newPatientId: number | null;
  dentistId: number;
  appointmentTypeId: number | null;
  date: string | Date;
  startTime: string | Date | null;
  endTime: string | Date | null;
  duration: number | null;
  roomId: number | null;
  notes: string | null;
  status: number | null;
}

export interface AppointmentType {
  appointmentTypeId: number;
  name: string;
  color: number | null;
  duration: number | null;
}

export interface WaitingRoom {
  waitingRoomId: number;
  patientId: number | null;
  newPatientId: number | null;
  arrivalTime: string | Date;
  status: number | null; // 1 = Waiting, 2 = In Treatment
}
