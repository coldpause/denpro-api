/**
 * Calendar Feed Routes (Express, not tRPC)
 *
 * These are plain HTTP GET endpoints because calendar apps (Google Calendar,
 * Apple Calendar, Outlook) need to fetch .ics files via simple GET requests
 * with no auth headers — just a token in the URL.
 *
 * Route: GET /cal/:token
 * Returns: text/calendar (iCalendar .ics format)
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateICalFeed } from '../services/icalGenerator';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /cal/:token
 *
 * Serves an iCalendar feed for the given feed token.
 * No auth header needed — the token IS the authentication.
 */
router.get('/cal/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Look up the feed token
    const feedToken = await prisma.calendarFeedToken.findUnique({
      where: { token },
      include: {
        dentist: { select: { dentistId: true, name: true } },
      },
    });

    if (!feedToken || !feedToken.active) {
      res.status(404).send('Calendar feed not found or has been revoked.');
      return;
    }

    // Update last access time (fire-and-forget)
    prisma.calendarFeedToken.update({
      where: { id: feedToken.id },
      data: { lastAccess: new Date() },
    }).catch(() => {}); // don't block response

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - feedToken.daysBehind);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + feedToken.daysAhead);
    endDate.setHours(23, 59, 59, 999);

    // Build appointment query
    const where: any = {
      date: { gte: startDate, lte: endDate },
      status: { notIn: [4] }, // exclude cancelled
    };

    // Filter by dentist if specified
    if (feedToken.dentistId) {
      where.dentistId = feedToken.dentistId;
    }

    // Fetch appointments
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { firstName: true, lastName: true, phone: true } },
        dentist: { select: { dentistId: true, name: true } },
        appointmentType: { select: { name: true, color: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    // Generate iCal feed
    const calName = feedToken.dentistId
      ? `DenPro — Dr. ${feedToken.dentist?.name || 'Unknown'}`
      : 'DenPro — All Appointments';

    const ical = generateICalFeed(
      appointments.map(apt => ({
        appointmentId: apt.appointmentId,
        date: apt.date,
        startTime: apt.startTime,
        endTime: apt.endTime,
        duration: apt.duration,
        status: apt.status,
        notes: apt.notes,
        patient: apt.patient,
        dentist: apt.dentist,
        appointmentType: apt.appointmentType,
      })),
      {
        calName,
        calDescription: feedToken.label,
        timezone: 'Asia/Beirut',
      }
    );

    // Serve as iCalendar
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${feedToken.label.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`);
    // Allow caching for 15 minutes (calendar apps typically refresh every 1-24 hours)
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.send(ical);

  } catch (err) {
    console.error('Calendar feed error:', err);
    res.status(500).send('Internal server error generating calendar feed.');
  }
});

/**
 * GET /cal/:token/download
 *
 * Same as above but forces download (for one-time .ics import).
 */
router.get('/cal/:token/download', async (req, res) => {
  try {
    const { token } = req.params;

    const feedToken = await prisma.calendarFeedToken.findUnique({
      where: { token },
      include: {
        dentist: { select: { dentistId: true, name: true } },
      },
    });

    if (!feedToken || !feedToken.active) {
      res.status(404).send('Calendar feed not found.');
      return;
    }

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - feedToken.daysBehind);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + feedToken.daysAhead);

    const where: any = {
      date: { gte: startDate, lte: endDate },
      status: { notIn: [4] },
    };
    if (feedToken.dentistId) where.dentistId = feedToken.dentistId;

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { firstName: true, lastName: true, phone: true } },
        dentist: { select: { dentistId: true, name: true } },
        appointmentType: { select: { name: true, color: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    const calName = feedToken.dentistId
      ? `DenPro — Dr. ${feedToken.dentist?.name || 'Unknown'}`
      : 'DenPro — All Appointments';

    const ical = generateICalFeed(
      appointments.map(apt => ({
        appointmentId: apt.appointmentId,
        date: apt.date,
        startTime: apt.startTime,
        endTime: apt.endTime,
        duration: apt.duration,
        status: apt.status,
        notes: apt.notes,
        patient: apt.patient,
        dentist: apt.dentist,
        appointmentType: apt.appointmentType,
      })),
      { calName, timezone: 'Asia/Beirut' }
    );

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="denpro_schedule.ics"`);
    res.send(ical);

  } catch (err) {
    console.error('Calendar download error:', err);
    res.status(500).send('Internal server error.');
  }
});

export default router;
