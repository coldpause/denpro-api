import { router, protectedProcedure } from '../trpc';

export const dashboardRouter = router({
  stats: protectedProcedure.query(async (opts) => {
    const prisma = opts.ctx.prisma;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalPatients,
      totalFamilyHeads,
      totalAppointments,
      todaysAppointments,
      totalTreatments,
      pendingRecalls,
      totalCredits,
      recentPatients,
      recentTreatments,
    ] = await Promise.all([
      prisma.patient.count(),
      prisma.patient.count({ where: { patientType: 1 } }),
      prisma.appointment.count(),
      prisma.appointment.count({
        where: {
          date: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
      prisma.treatment.count(),
      prisma.patientRecall.count({
        where: {
          completedDate: null,
          dueDate: { lte: new Date() },
        },
      }),
      prisma.credit.aggregate({
        _sum: { amount: true },
      }),
      prisma.patient.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          patientId: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
      }),
      prisma.treatment.findMany({
        take: 5,
        orderBy: { dateTime: 'desc' },
        include: {
          patient: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return {
      totalPatients,
      totalFamilyHeads,
      totalFamilyMembers: totalPatients - totalFamilyHeads,
      totalAppointments,
      todaysAppointments,
      totalTreatments,
      pendingRecalls,
      outstandingBalance: Number(totalCredits._sum.amount || 0),
      recentPatients,
      recentTreatments: recentTreatments.map((t) => ({
        treatmentId: t.treatmentId,
        patientName: `${t.patient.firstName} ${t.patient.lastName || ''}`.trim(),
        treatmentDate: t.dateTime,
        fee: t.netPrice ? Number(t.netPrice) : null,
        status: t.procStatusId,
      })),
    };
  }),
});
