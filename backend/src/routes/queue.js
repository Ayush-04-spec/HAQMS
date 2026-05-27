const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/queue
// List all active queue tokens
// DEBUGGING FIX: Added comprehensive error logging and type coercion for query parameters
// The doctorId from query string is a string, but the database expects an integer
router.get('/', authenticate, async (req, res) => {
  try {
    const { doctorId, status } = req.query;

    const where = {};
    
    // TYPE COERCION FIX: Convert doctorId from string to integer
    // Query parameters are always strings, but Prisma expects Int type for doctorId
    if (doctorId) {
      where.doctorId = parseInt(doctorId, 10);
      
      // Validate that the conversion was successful
      if (isNaN(where.doctorId)) {
        return res.status(400).json({ 
          error: 'Invalid doctorId parameter',
          details: 'doctorId must be a valid integer'
        });
      }
    }
    
    if (status) where.status = status;

    // Include both patient and doctor relations as required by the updated schema
    const tokens = await prisma.queueToken.findMany({
      where,
      include: {
        patient: true,
        doctor: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(tokens);
  } catch (error) {
    // DEBUGGING FIX: Add comprehensive error logging to diagnose silent failures
    console.error('[QUEUE GET ERROR]:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'Failed to retrieve queue', 
      details: error.message 
    });
  }
});

// POST /api/queue/checkin
// Generate a new queue token for a patient
// RACE CONDITION FIX: Uses Prisma interactive transaction with Serializable isolation
// to guarantee atomic token number generation under high concurrency.
// This prevents duplicate token numbers when multiple receptionists check-in patients simultaneously.
router.post('/checkin', authenticate, async (req, res) => {
  try {
    const { patientId, doctorId, appointmentId } = req.body;

    // Input validation
    if (!patientId || !doctorId) {
      return res.status(400).json({ error: 'Patient and Doctor ID are required for check-in.' });
    }

    // TYPE COERCION: Ensure IDs are integers
    const safePatientId = parseInt(patientId, 10);
    const safeDoctorId = parseInt(doctorId, 10);
    const safeAppointmentId = appointmentId ? parseInt(appointmentId, 10) : null;

    if (isNaN(safePatientId) || isNaN(safeDoctorId)) {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        details: 'Patient and Doctor IDs must be valid integers'
      });
    }

    // Calculate today's start timestamp for filtering
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // CONCURRENCY FIX: Atomic transaction with Serializable isolation level
    // This ensures that concurrent requests cannot generate duplicate token numbers.
    // The transaction guarantees:
    // 1. Isolation: No other transaction can read/write the same data simultaneously
    // 2. Atomicity: Either all operations succeed or all fail
    // 3. Consistency: Token numbers are always sequential without gaps or duplicates
    const newToken = await prisma.$transaction(async (tx) => {
      // Step 1: Find the highest token number for this doctor today
      // The Serializable isolation level prevents phantom reads
      const lastRecord = await tx.queueToken.findFirst({
        where: {
          doctorId: safeDoctorId,
          createdAt: { gte: todayStart }
        },
        orderBy: { tokenNumber: 'desc' },
        select: { tokenNumber: true }
      });

      // Step 2: Calculate next token number
      const nextTokenNumber = lastRecord ? lastRecord.tokenNumber + 1 : 1;

      // Step 3: Create the new token within the same transaction
      // The lock is held until the transaction commits, ensuring atomicity
      const token = await tx.queueToken.create({
        data: {
          tokenNumber: nextTokenNumber,
          patientId: safePatientId,
          doctorId: safeDoctorId,
          appointmentId: safeAppointmentId,
          status: 'WAITING',
        },
        include: {
          patient: true,
          doctor: true,
        },
      });

      return token;
    }, {
      // Serializable isolation level prevents all concurrency anomalies
      // This is the highest isolation level and guarantees complete isolation
      isolationLevel: 'Serializable',
      // Increase timeout for high-concurrency scenarios
      maxWait: 5000,  // Wait up to 5 seconds to acquire transaction lock
      timeout: 10000, // Transaction must complete within 10 seconds
    });

    res.status(201).json({
      message: 'Checked in successfully. Token generated.',
      token: newToken,
    });
  } catch (error) {
    console.error('[QUEUE CHECK-IN ERROR]:', {
      message: error.message,
      code: error.code,
      patientId: req.body.patientId,
      doctorId: req.body.doctorId
    });
    
    // Handle specific transaction errors
    if (error.code === 'P2034') {
      return res.status(409).json({ 
        error: 'Check-in conflict detected. Please retry.',
        details: 'Another check-in is in progress for this doctor.'
      });
    }
    
    // Handle serialization failures (concurrent transaction conflicts)
    if (error.code === '40001' || error.message.includes('serialization')) {
      return res.status(409).json({
        error: 'Concurrent check-in detected. Please retry.',
        details: 'Multiple check-ins occurred simultaneously. Your request was safely rolled back.'
      });
    }
    
    res.status(500).json({ error: 'Check-in failed', details: error.message });
  }
});

// PATCH /api/queue/:id
// Update token status (WAITING -> CALLING -> COMPLETED / SKIPPED)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // TYPE COERCION FIX: Ensure id is parsed as integer
    const tokenId = parseInt(req.params.id, 10);
    
    if (isNaN(tokenId)) {
      return res.status(400).json({ 
        error: 'Invalid token ID',
        details: 'Token ID must be a valid integer'
      });
    }

    const updatedToken = await prisma.queueToken.update({
      where: { id: tokenId },
      data: { status },
      include: {
        patient: true,
        doctor: true,
      },
    });

    res.json(updatedToken);
  } catch (error) {
    // DEBUGGING FIX: Add error logging for silent failures
    console.error('[QUEUE PATCH ERROR]:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta
    });
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        error: 'Queue token not found',
        details: 'The specified token does not exist'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update queue token', 
      details: error.message 
    });
  }
});

module.exports = router;
