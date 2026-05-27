const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorizeAdminOnlyLegacy } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/reports/appointments
// SINGLE JOIN AGGREGATE OPTIMIZATION: Eliminates N+1 query bottleneck
// Uses native Prisma include to eagerly load all relations in one database round-trip
// SECURITY: Admin-only endpoint - exposes sensitive system-wide appointment data
router.get('/appointments', authenticate, authorizeAdminOnlyLegacy, async (req, res) => {
  try {
    const start = Date.now();

    // Single optimized query with relational inclusions
    const appointments = await prisma.appointment.findMany({
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        doctor: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        appointmentDate: 'desc'
      }
    });

    // Normalize structure for frontend compatibility
    const normalizedAppointments = appointments.map(apt => ({
      id: apt.id,
      appointmentDate: apt.appointmentDate,
      status: apt.status,
      notes: apt.notes,
      patient: {
        id: apt.patient.id,
        name: apt.patient.name,
        email: apt.patient.email,
        phone: apt.patient.phone
      },
      doctor: {
        id: apt.doctor.id,
        name: apt.doctor.user?.name || 'Unknown',
        email: apt.doctor.user?.email || '',
        specialization: apt.doctor.specialization
      },
      createdAt: apt.createdAt,
      updatedAt: apt.updatedAt
    }));

    const durationMs = Date.now() - start;

    console.log(`[OPTIMIZED REPORT] Fetched ${appointments.length} appointments with relations in ${durationMs}ms`);

    res.json({
      success: true,
      timeTakenMs: durationMs,
      count: appointments.length,
      data: normalizedAppointments
    });
  } catch (error) {
    console.error('[REPORTS API ERROR - GET /appointments]:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate appointments report', 
      details: error.message 
    });
  }
});

// GET /api/reports/doctor-stats
// PARALLEL AGGREGATION OPTIMIZATION: Uses groupBy for efficient statistics
// SECURITY: Admin-only endpoint - exposes sensitive system-wide performance metrics
router.get('/doctor-stats', authenticate, authorizeAdminOnlyLegacy, async (req, res) => {
  try {
    const start = Date.now();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Single query with user relation included
    const doctors = await prisma.doctor.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Parallel aggregations
    const [
      appointmentsByDoctor,
      completedByDoctor,
      cancelledByDoctor,
      queueTokensByDoctor
    ] = await Promise.all([
      prisma.appointment.groupBy({
        by: ['doctorId'],
        _count: { id: true }
      }),
      prisma.appointment.groupBy({
        by: ['doctorId'],
        where: { status: 'COMPLETED' },
        _count: { id: true }
      }),
      prisma.appointment.groupBy({
        by: ['doctorId'],
        where: { status: 'CANCELLED' },
        _count: { id: true }
      }),
      prisma.queueToken.groupBy({
        by: ['doctorId'],
        where: {
          createdAt: {
            gte: today,
            lt: tomorrow
          }
        },
        _count: { id: true }
      })
    ]);

    // O(1) lookup maps
    const appointmentsMap = new Map(appointmentsByDoctor.map(item => [item.doctorId, item._count.id]));
    const completedMap = new Map(completedByDoctor.map(item => [item.doctorId, item._count.id]));
    const cancelledMap = new Map(cancelledByDoctor.map(item => [item.doctorId, item._count.id]));
    const queueMap = new Map(queueTokensByDoctor.map(item => [item.doctorId, item._count.id]));

    // Build report with in-memory calculations
    const reportData = doctors.map(doc => {
      const totalAppointments = appointmentsMap.get(doc.id) || 0;
      const completedAppointments = completedMap.get(doc.id) || 0;
      const cancelledAppointments = cancelledMap.get(doc.id) || 0;
      const todayQueueSize = queueMap.get(doc.id) || 0;

      return {
        id: doc.id,
        name: doc.user?.name || 'Unknown',
        email: doc.user?.email || '',
        specialization: doc.specialization || 'General',
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        todayQueueSize,
        completionRate: totalAppointments > 0 
          ? Math.round((completedAppointments / totalAppointments) * 100) 
          : 0,
        cancellationRate: totalAppointments > 0
          ? Math.round((cancelledAppointments / totalAppointments) * 100)
          : 0
      };
    });

    const durationMs = Date.now() - start;

    console.log(`[OPTIMIZED REPORT] Generated stats for ${doctors.length} doctors in ${durationMs}ms`);

    res.json({
      success: true,
      timeTakenMs: durationMs,
      doctorCount: doctors.length,
      data: reportData
    });
  } catch (error) {
    console.error('[REPORTS API ERROR - GET /doctor-stats]:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate doctor stats report', 
      details: error.message 
    });
  }
});

module.exports = router;
