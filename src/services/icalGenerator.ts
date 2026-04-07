/**
 * iCalendar (.ics) Feed Generator
 *
 * Generates RFC 5545 compliant iCalendar feeds from DenPro appointments.
 * Compatible with Google Calendar, Apple Calendar, Outlook, and any
 * CalDAV-compatible client.
 *
 * Usage:
 *   const ical = generateICalFeed(appointments, { calName: "Dr. V Schedule" })
 *   // Returns a string you can serve with Content-Type: text/calendar
 */

interface ICalAppointment {
  appointmentId: number;
  date: Date;
  startTime: Date | null;
  endTime: Date | null;
  duration: number | null; // minutes
  status: number | null; // 0=scheduled, 1=arrived, 2=in-treatment, 3=completed, 4=cancelled
  notes: string | null;
  patient: { firstName: string; lastName: string | null; phone: string | null } | null;
  dentist: { name: string } | null;
  appointmentType: { name: string; color: number | null } | null;
}

interface ICalOptions {
  calName?: string;       // Calendar display name
  calDescription?: string;
  timezone?: string;      // IANA timezone (default: Asia/Beirut for Lebanon)
  clinicName?: string;
  prodId?: string;
}

const STATUS_MAP: Record<number, string> = {
  0: 'CONFIRMED',    // scheduled
  1: 'CONFIRMED',    // arrived
  2: 'CONFIRMED',    // in-treatment
  3: 'CONFIRMED',    // completed
  4: 'CANCELLED',    // cancelled/no-show
};

/**
 * Escape special characters per RFC 5545
 */
function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Format a Date to iCal DTSTART/DTEND format: 20260402T093000
 */
function formatICalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Format a Date to iCal UTC: 20260402T093000Z
 */
function formatICalDateUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Generate a single VEVENT block
 */
function generateVEvent(apt: ICalAppointment, options: ICalOptions): string {
  const uid = `apt-${apt.appointmentId}@denpro`;
  const now = formatICalDateUTC(new Date());

  // Determine start and end times
  let dtStart: string;
  let dtEnd: string;
  const tz = options.timezone || 'Asia/Beirut';

  if (apt.startTime) {
    dtStart = formatICalDate(new Date(apt.startTime));
    if (apt.endTime) {
      dtEnd = formatICalDate(new Date(apt.endTime));
    } else if (apt.duration) {
      const end = new Date(apt.startTime);
      end.setMinutes(end.getMinutes() + apt.duration);
      dtEnd = formatICalDate(end);
    } else {
      // Default 30 min
      const end = new Date(apt.startTime);
      end.setMinutes(end.getMinutes() + 30);
      dtEnd = formatICalDate(end);
    }
  } else {
    // All-day event if no start time
    const d = new Date(apt.date);
    const dateOnly = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dateOnly}`,
      `DTEND;VALUE=DATE:${dateOnly}`,
      `SUMMARY:${escapeIcal(buildSummary(apt))}`,
      apt.notes ? `DESCRIPTION:${escapeIcal(buildDescription(apt))}` : '',
      `STATUS:${STATUS_MAP[apt.status ?? 0] || 'CONFIRMED'}`,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  }

  const status = STATUS_MAP[apt.status ?? 0] || 'CONFIRMED';

  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${tz}:${dtStart}`,
    `DTEND;TZID=${tz}:${dtEnd}`,
    `SUMMARY:${escapeIcal(buildSummary(apt))}`,
    `DESCRIPTION:${escapeIcal(buildDescription(apt))}`,
    `STATUS:${status}`,
  ];

  // Add color category based on appointment type
  if (apt.appointmentType?.name) {
    lines.push(`CATEGORIES:${escapeIcal(apt.appointmentType.name)}`);
  }

  // Add alarm (15 min before)
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Appointment in 15 minutes`,
    'END:VALARM',
  );

  lines.push('END:VEVENT');

  return lines.join('\r\n');
}

function buildSummary(apt: ICalAppointment): string {
  const parts: string[] = [];

  if (apt.patient) {
    parts.push(`${apt.patient.firstName} ${apt.patient.lastName || ''}`.trim());
  } else {
    parts.push('Walk-in');
  }

  if (apt.appointmentType?.name) {
    parts.push(`(${apt.appointmentType.name})`);
  }

  return parts.join(' ');
}

function buildDescription(apt: ICalAppointment): string {
  const lines: string[] = [];

  if (apt.patient) {
    lines.push(`Patient: ${apt.patient.firstName} ${apt.patient.lastName || ''}`.trim());
    if (apt.patient.phone) {
      lines.push(`Phone: ${apt.patient.phone}`);
    }
  }

  if (apt.dentist?.name) {
    lines.push(`Dentist: Dr. ${apt.dentist.name}`);
  }

  if (apt.appointmentType?.name) {
    lines.push(`Type: ${apt.appointmentType.name}`);
  }

  if (apt.duration) {
    lines.push(`Duration: ${apt.duration} min`);
  }

  if (apt.notes) {
    lines.push(`Notes: ${apt.notes}`);
  }

  const statusLabels: Record<number, string> = {
    0: 'Scheduled',
    1: 'Arrived',
    2: 'In Treatment',
    3: 'Completed',
    4: 'Cancelled',
  };
  if (apt.status !== null && apt.status !== undefined) {
    lines.push(`Status: ${statusLabels[apt.status] || 'Unknown'}`);
  }

  return lines.join('\\n');
}

/**
 * Generate a complete iCalendar feed from a list of appointments.
 */
export function generateICalFeed(
  appointments: ICalAppointment[],
  options: ICalOptions = {}
): string {
  const calName = options.calName || 'DenPro Schedule';
  const calDesc = options.calDescription || 'Dental appointments from DenPro';
  const prodId = options.prodId || '-//DenPro Web//Calendar Feed//EN';
  const tz = options.timezone || 'Asia/Beirut';

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcal(calName)}`,
    `X-WR-CALDESC:${escapeIcal(calDesc)}`,
    `X-WR-TIMEZONE:${tz}`,
    '',
    // Timezone definition for Asia/Beirut
    'BEGIN:VTIMEZONE',
    `TZID:${tz}`,
    'BEGIN:STANDARD',
    'DTSTART:19701025T000000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'TZOFFSETFROM:+0300',
    'TZOFFSETTO:+0200',
    'TZNAME:EET',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700329T000000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0300',
    'TZNAME:EEST',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ].join('\r\n');

  const events = appointments.map(apt => generateVEvent(apt, options)).join('\r\n');

  const footer = 'END:VCALENDAR';

  return `${header}\r\n${events}\r\n${footer}\r\n`;
}

export type { ICalAppointment, ICalOptions };
