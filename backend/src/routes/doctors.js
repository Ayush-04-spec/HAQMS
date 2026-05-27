const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/doctors
// SECURITY FIX: Migrated from $queryRawUnsafe to Prisma's findMany API.
// Prisma inherently utilizes parameterized queries, neutralizing SQL injection vectors.
// The previous unsafe implementation used raw SQL interpolation:
// SELECT * FROM "Doctor" WHERE name ILIKE '%${query}%'
// This allowed SQL injection attacks that could leak sensitive data.
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, specialization } = req.query;

    // Build a dynamic 'where' object for Prisma's safe query builder
    const whereClause = {};

    // SECURE SEARCH: Search by doctor's name through the User relation
    // Uses Prisma's parameterized queries with case-insensitive matching
    if (search) {
      whereClause.user = {
        name: {
          contains: search,
          mode: 'insensitive', // Provides the same behavior as ILIKE, but safely
        }
      };
    }

    if (specialization && specialization !== 'All') {
      whereClause.specialization = specialization;
    }

    // Prisma executes this safely using parameterized inputs under the hood
    // Include the user relation to return doctor names in the response
    const doctors = await prisma.doctor.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Wrapped in a data object for consistent API formatting
    res.json({ success: true, data: doctors }); 
  } catch (error) {
    // SECURE ERROR HANDLING: Log internally, but return a generic message to the client
    console.error('[DOCTORS API ERROR - GET /]:', {
      error: error.message,
      stack: error.stack,
      search: req.query.search,
      specialization: req.query.specialization
    });
    res.status(500).json({ success: false, error: 'An unexpected database error occurred.' });
  }
});

// GET /api/doctors/stats
// PERFORMANCE FIX: Replaced sequential awaits with Promise.all() to run queries concurrently.
router.get('/stats', authenticate, async (req, res) => {
  try {
    const start = Date.now();

    // Fire all database queries concurrently. The event loop is no longer blocked waiting for each to finish.
    const [totalDoctors, surgeonsCount, averageFee, highestExperience] = await Promise.all([
      prisma.doctor.count(),
      prisma.doctor.count({
        where: { department: 'Surgery' },
      }),
      prisma.doctor.aggregate({
        _avg: { consultationFee: true },
      }),
      prisma.doctor.aggregate({
        _max: { experience: true },
      })
    ]);

    const durationMs = Date.now() - start;

    res.json({
      success: true,
      data: {
        total: totalDoctors,
        surgeons: surgeonsCount,
        averageFee: Math.round(averageFee._avg.consultationFee || 0),
        maxExperience: highestExperience._max.experience || 0,
      },
      debugInfo: {
        executionTimeMs: durationMs,
        notes: 'Queries parallelized using Promise.all.'
      }
    });
  } catch (error) {
    console.error('[STATS_ERROR]:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch doctor statistics.' });
  }
});

// GET /api/doctors/:id
// Get specific doctor by ID with user information
router.get('/:id', authenticate, async (req, res) => {
  try {
    // SAFE ID PARSING: Convert string parameter to integer
    const doctorId = parseInt(req.params.id, 10);
    
    // Validate that parsing succeeded
    if (isNaN(doctorId)) {
      return res.status(400).json({ error: 'Invalid doctor ID format' });
    }
    
    const doctor = await prisma.doctor.findUnique({
      where: { id: doctorId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json(doctor);
  } catch (error) {
    console.error('[DOCTORS API ERROR - GET /:id]:', {
      doctorId: req.params.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch doctor details', details: error.message });
  }
});

module.exports = router;
