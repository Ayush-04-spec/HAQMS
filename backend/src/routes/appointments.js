const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/appointments
// Multi-role adaptive endpoint: Admins see all, Doctors see only their own
router.get('/', authenticate, async (req, res) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    const userId = req.user?.id;
    
    const whereClause = {};
    
    // Role-based filtering
    if (userRole === 'DOCTOR') {
      const doctorProfile = await prisma.doctor.findFirst({
        where: { userId: userId }
      });
      
      if (!doctorProfile) {
        console.warn('[APPOINTMENTS] Doctor profile not found for userId:', userId);
        return res.json({ success: true, count: 0, appointments: [] });
      }
      
      whereClause.doctorId = doctorProfile.id;
      console.log('[APPOINTMENTS] Doctor filter applied:', { userId, doctorId: doctorProfile.id });
    } else if (userRole !== 'ADMIN' && userRole !== 'RECEPTIONIST') {
      return res.status(403).json({ 
        success: false, 
        error: 'Access Denied: Insufficient authorization permissions.' 
      });
    }
    
    // Apply query parameters
    const { doctorId, status } = req.query;
    if (doctorId && userRole !== 'DOCTOR') {
      const parsed = parseInt(doctorId, 10);
      if (!isNaN(parsed)) whereClause.doctorId = parsed;
    }
    if (status) whereClause.status = status;
    
    // Single join query with all relations
    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            dateOfBirth: true,
            medicalHistory: true
          }
        },
        doctor: {
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { appointmentDate: 'asc' }
    });
    
    // Normalize response
    const normalized = appointments.map(app => {
      let age = null;
      if (app.patient?.dateOfBirth) {
        const birthDate = new Date(app.patient.dateOfBirth);
        const ageDiff = Date.now() - birthDate.getTime();
        age = Math.abs(new Date(ageDiff).getUTCFullYear() - 1970);
      }
      
      return {
        ...app,
        patient: app.patient ? {
          id: app.patient.id,
          name: app.patient.name,
          phoneNumber: app.patient.phone,
          age: age,
          medicalHistory: app.patient.medicalHistory
        } : null,
        doctor: app.doctor ? {
          id: app.doctor.id,
          name: app.doctor.user?.name || 'Unknown Doctor',
          specialization: app.doctor.specialization
        } : null
      };
    });
    
    return res.json({
      success: true,
      count: normalized.length,
      appointments: normalized
    });
    
  } catch (error) {
    console.error('[APPOINTMENTS GET ERROR]:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve appointments',
      details: error.message 
    });
  }
});

// POST /api/appointments - Book appointment
router.post('/', authenticate, async (req, res) => {
  try {
    const { patientId, doctorId, appointmentDate, notes } = req.body;

    if (!patientId || !doctorId || !appointmentDate) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields',
        message: 'Patient ID, Doctor ID, and Appointment Date are required.'
      });
    }

    const parsedPatientId = parseInt(patientId, 10);
    const parsedDoctorId = parseInt(doctorId, 10);
    
    if (isNaN(parsedPatientId) || isNaN(parsedDoctorId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid ID format',
        message: 'Patient and Doctor IDs must be valid integers'
      });
    }

    const parsedDate = new Date(appointmentDate);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid date format',
        message: 'Invalid appointment date provided'
      });
    }

    if (parsedDate < new Date()) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid appointment time',
        message: 'Appointment date must be in the future'
      });
    }

    const doctor = await prisma.doctor.findUnique({
      where: { id: parsedDoctorId },
      select: { userId: true, specialization: true }
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found',
        message: `No doctor exists with ID: ${parsedDoctorId}`
      });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: parsedPatientId },
      select: { id: true, name: true }
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found',
        message: `No patient exists with ID: ${parsedPatientId}`
      });
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId: parsedPatientId,
        doctorId: parsedDoctorId,
        doctorUserId: doctor.userId,
        appointmentDate: parsedDate,
        notes: notes || null,
        status: 'SCHEDULED',
      },
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true } },
        doctor: { select: { id: true, specialization: true, user: { select: { name: true } } } }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointment
    });
    
  } catch (error) {
    console.error('[APPOINTMENTS POST ERROR]:', error.message);

    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'Appointment slot conflict',
        message: 'This doctor already has an appointment at the selected time'
      });
    }

    if (error.code === 'P2003') {
      return res.status(400).json({
        success: false,
        error: 'Invalid reference',
        message: 'The specified patient or doctor does not exist'
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Failed to book appointment',
      details: error.message
    });
  }
});

// PATCH /api/appointments/:id - Update status
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ 
        success: false,
        error: 'Status is required'
      });
    }

    const allowedStatuses = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
    if (!allowedStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
        message: `Status must be one of: ${allowedStatuses.join(', ')}`
      });
    }

    const appointmentId = parseInt(req.params.id, 10);
    if (isNaN(appointmentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid appointment ID'
      });
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: status.toUpperCase() },
      include: {
        patient: { select: { id: true, name: true } },
        doctor: { select: { id: true, user: { select: { name: true } } } }
      }
    });

    res.json({
      success: true,
      message: 'Appointment status updated successfully',
      appointment: updated
    });
    
  } catch (error) {
    console.error('[APPOINTMENTS PATCH ERROR]:', error.message);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        error: 'Appointment not found'
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to update appointment',
      details: error.message
    });
  }
});

module.exports = router;
