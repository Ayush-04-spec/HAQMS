const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    // 1. Extract and normalize the incoming search parameters
    let search = (req.query.search || req.query.query || req.query.name || '').trim();
    
    // Advanced Normalization: Strip out "Dr." or "Dr " prefix so titles don't break lookups
    search = search.replace(/^dr\.?\s+/i, '');
    
    const whereClause = {};
    
    // 2. Query with User relation since doctor info is in the User model
    if (search !== '') {
      whereClause.OR = [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { specialization: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const doctors = await prisma.doctor.findMany({
      where: whereClause,
      include: {
        user: true  // Include the related User data
      },
      orderBy: { id: 'asc' }
    });
    
    // 3. Flatten and enrich properties to ensure absolute compatibility with frontend layout keys
    const enrichedDoctors = doctors.map(doc => ({
      id: doc.id,
      userId: doc.userId,
      name: doc.user?.name || 'Unknown Physician',
      email: doc.user?.email || '',
      phone: doc.user?.phone || '',
      specialty: doc.specialization || 'General Medicine',
      department: doc.specialization || 'General Medicine',
      specialization: doc.specialization,
      licenseNumber: doc.licenseNumber,
      experience: '5',  // Default value since not in schema
      fee: 100,  // Default value since not in schema
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
    
    // 4. Return a clean, flat array directly to satisfy frontend component structures
    return res.json(enrichedDoctors);
  } catch (error) {
    console.error('[PHYSICIAN ROUTE ERROR]:', error.message);
    // Fallback: Send a safe empty array so the frontend grid clears gracefully instead of crashing
    return res.json([]);
  }
});

module.exports = router;
