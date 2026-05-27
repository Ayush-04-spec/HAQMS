const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/appointments
// List all appointments
// PERFORMANCE BUG: Classic N+1 Query Issue!
// Instead of using Prisma's include, it loops through each appointment and executes
// individual select statements for Patient and Doctor details.
router.get('/', authenticate, async (req, res) => {
  try {
    const { doctorId, status } = req.query;

    // TYPE COERCION FIX: Query parameters are always strings, but Prisma expects Int
    // Without parseInt(), Prisma silently fails to match records (string '1' !== int 1)
    // This caused doctors to see "No appointments scheduled" despite having appointments in DB
    const where = {};
    if (doctorId) {
      const parsedDoctorId = parseInt(doctorId, 10);
      if (isNaN(parsedDoctorId)) {
        return res.status(400).json({ 
          error: 'Invalid doctorId parameter', 
          message: 'doctorId must be a valid integer' 
        });
      }
      where.doctorId = parsedDoctorId;
    }
    if (status) where.status = status;

    // Fetch core appointments
    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { appointmentDate: 'asc' },
    });

    const detailedAppointments = [];

    // N+1 triggers here: For every single appointment, we perform two extra queries!
    for (const app of appointments) {
      console.log(`[N+1 DB QUERY] Fetching Patient (${app.patientId}) and Doctor (${app.doctorId}) for Appointment ${app.id}`);
      
      const patient = await prisma.patient.findUnique({
        where: { id: app.patientId },
      });

      const doctor = await prisma.doctor.findUnique({
        where: { id: app.doctorId },
      });

      detailedAppointments.push({
        ...app,
        patient: patient ? { id: patient.id, name: patient.name, phoneNumber: patient.phoneNumber, age: patient.age, medicalHistory: patient.medicalHistory } : null,
        doctor: doctor ? { id: doctor.id, name: doctor.name, specialization: doctor.specialization } : null,
      });
    }

    res.json({
      success: true,
      count: detailedAppointments.length,
      appointments: detailedAppointments,
    });
  } catch (error) {
    // ERROR LOGGING FIX: Prevent silent failures by logging full error details
    // Without console.error(), backend failures are invisible in terminal logs
    // This makes debugging nearly impossible for developers
    console.error('[APPOINTMENTS GET ERROR]', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack,
    });
    
    res.status(500).json({ error: 'Failed to retrieve appointments', details: error.message });
  }
});

// POST /api/appointments
// Book an appointment
// DATA INTEGRITY FIX: Database-level unique constraint prevents double-booking
// TYPE SAFETY FIX: Explicit type casting and validation for all input parameters
// The schema enforces @@unique([doctorId, appointmentDate]) to guarantee slot exclusivity
// Application layer catches Prisma P2002 error and returns user-friendly 409 Conflict response
router.post('/', authenticate, async (req, res) => {
  try {
    const { patientId, doctorId, appointmentDate, notes } = req.body;

    // ==========================================
    // INPUT VALIDATION
    // ==========================================
    if (!patientId || !doctorId || !appointmentDate) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields',
        message: 'Patient ID, Doctor ID, and Appointment Date are required.',
        requiredFields: ['patientId', 'doctorId', 'appointmentDate']
      });
    }

    // ==========================================
    // TYPE CASTING & SANITIZATION
    // ==========================================
    // Frontend sends strings, but Prisma expects Int for IDs
    // Explicit parsing prevents type mismatch errors
    
    const parsedPatientId = parseInt(patientId, 10);
    if (isNaN(parsedPatientId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid patient ID',
        message: 'Patient ID must be a valid integer',
        received: { patientId, type: typeof patientId }
      });
    }

    const parsedDoctorId = parseInt(doctorId, 10);
    if (isNaN(parsedDoctorId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid doctor ID',
        message: 'Doctor ID must be a valid integer',
        received: { doctorId, type: typeof doctorId }
      });
    }

    // ==========================================
    // DATE PARSING & VALIDATION
    // ==========================================
    // Frontend sends ISO string: "2026-05-27T14:30:00.000Z"
    // Convert to Date object and validate
    
    const parsedDate = new Date(appointmentDate);
    
    // Check if date parsing succeeded
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid date format',
        message: 'Malformed or invalid date sequence provided. Expected ISO 8601 format.',
        received: { appointmentDate, type: typeof appointmentDate },
        hint: 'Use format: YYYY-MM-DDTHH:mm:ss.sssZ'
      });
    }

    // Validate appointment date is in the future
    const now = new Date();
    if (parsedDate < now) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid appointment time',
        message: 'Appointment date must be in the future.',
        received: { appointmentDate: parsedDate.toISOString() },
        currentTime: now.toISOString()
      });
    }

    console.log('[APPOINTMENTS POST] Sanitized parameters:', {
      patientId: parsedPatientId,
      doctorId: parsedDoctorId,
      appointmentDate: parsedDate.toISOString(),
      notes: notes || 'None provided'
    });

    // ==========================================
    // LOOKUP DOCTOR USER ID
    // ==========================================
    // The Appointment schema requires doctorUserId (User.id)
    // We need to look up the User ID from the Doctor record
    
    const doctor = await prisma.doctor.findUnique({
      where: { id: parsedDoctorId },
      select: { userId: true, specialization: true }
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found',
        message: `No doctor exists with ID: ${parsedDoctorId}`,
        code: 'DOCTOR_NOT_FOUND'
      });
    }

    console.log('[APPOINTMENTS POST] Doctor lookup successful:', {
      doctorId: parsedDoctorId,
      userId: doctor.userId,
      specialization: doctor.specialization
    });

    // ==========================================
    // VERIFY PATIENT EXISTS
    // ==========================================
    const patient = await prisma.patient.findUnique({
      where: { id: parsedPatientId },
      select: { id: true, name: true }
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found',
        message: `No patient exists with ID: ${parsedPatientId}`,
        code: 'PATIENT_NOT_FOUND'
      });
    }

    console.log('[APPOINTMENTS POST] Patient lookup successful:', {
      patientId: parsedPatientId,
      patientName: patient.name
    });

    // ==========================================
    // CREATE APPOINTMENT WITH SANITIZED DATA
    // ==========================================
    // DATA INTEGRITY: The database unique constraint will prevent duplicates
    // No need for application-level check (which was flawed and had race conditions)
    // The constraint is enforced atomically at the database level
    
    const appointment = await prisma.appointment.create({
      data: {
        patientId: parsedPatientId,
        doctorId: parsedDoctorId,
        doctorUserId: doctor.userId, // Correct User ID from Doctor lookup
        appointmentDate: parsedDate,
        notes: notes || null,
        status: 'SCHEDULED',
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        doctor: {
          select: {
            id: true,
            specialization: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    console.log('[APPOINTMENTS POST] Appointment created successfully:', {
      appointmentId: appointment.id,
      patientName: appointment.patient.name,
      doctorName: appointment.doctor.user.name,
      appointmentDate: appointment.appointmentDate.toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointment,
    });
    
  } catch (error) {
    console.error('[APPOINTMENTS POST ERROR] Appointment booking failed:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    });

    // ==========================================
    // CONSTRAINT VIOLATION HANDLING
    // ==========================================
    
    // Catch Prisma unique constraint error (P2002)
    // This occurs when attempting to book a doctor at an already-occupied time slot
    if (error.code === 'P2002') {
      const fields = error.meta?.target || ['doctorId', 'appointmentDate'];
      
      return res.status(409).json({
        success: false,
        error: 'Appointment slot conflict',
        message: 'This doctor already has an appointment scheduled at the selected time. Please choose a different time slot.',
        conflictFields: fields,
        code: 'SLOT_ALREADY_BOOKED',
      });
    }

    // Handle foreign key constraint violations (invalid patientId or doctorId)
    if (error.code === 'P2003') {
      return res.status(400).json({
        success: false,
        error: 'Invalid reference',
        message: 'The specified patient or doctor does not exist.',
        code: 'INVALID_REFERENCE',
        meta: error.meta
      });
    }

    // Generic error response for other failures
    res.status(500).json({ 
      success: false,
      error: 'Failed to book appointment', 
      message: 'An unexpected error occurred while booking the appointment. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /api/appointments/:id
// Update appointment status (COMPLETED, CANCELLED, etc.)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;

    // ==========================================
    // INPUT VALIDATION
    // ==========================================
    if (!status) {
      return res.status(400).json({ 
        success: false,
        error: 'Status is required',
        message: 'Please provide a status value to update the appointment.'
      });
    }

    // Validate status is one of the allowed values
    const allowedStatuses = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
    if (!allowedStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
        message: `Status must be one of: ${allowedStatuses.join(', ')}`,
        received: status
      });
    }

    // ==========================================
    // TYPE CASTING FOR ID PARAMETER
    // ==========================================
    // URL parameters are always strings, convert to integer
    const appointmentId = parseInt(req.params.id, 10);
    
    if (isNaN(appointmentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid appointment ID',
        message: 'Appointment ID must be a valid integer',
        received: { id: req.params.id, type: typeof req.params.id }
      });
    }

    console.log('[APPOINTMENTS PATCH] Updating appointment:', {
      appointmentId,
      newStatus: status.toUpperCase()
    });

    // ==========================================
    // UPDATE APPOINTMENT
    // ==========================================
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: status.toUpperCase() },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
          },
        },
        doctor: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    console.log('[APPOINTMENTS PATCH] Appointment updated successfully:', {
      appointmentId: updated.id,
      oldStatus: req.body.status,
      newStatus: updated.status,
      patientName: updated.patient.name,
      doctorName: updated.doctor.user.name
    });

    res.json({
      success: true,
      message: 'Appointment status updated successfully',
      appointment: updated
    });
    
  } catch (error) {
    // ERROR LOGGING: Log full error details for debugging
    console.error('[APPOINTMENTS PATCH ERROR]', {
      appointmentId: req.params.id,
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack,
    });
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        error: 'Appointment not found', 
        message: `No appointment exists with ID: ${req.params.id}`,
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to update appointment', 
      message: 'An unexpected error occurred while updating the appointment.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
