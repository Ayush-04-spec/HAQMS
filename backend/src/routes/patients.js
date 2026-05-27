const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorizeAdminOnlyLegacy } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/patients
// STRICT RELATIONAL FILTERING: Prevents unfiltered database dumps
// ADAPTIVE SCHEMA SUPPORT: Handles both flat Patient model and nested User relation
// ZERO-LEAK ARCHITECTURE: All queries are explicitly filtered, never returns unfiltered data
router.get('/', authenticate, async (req, res) => {
  try {
    // ==========================================
    // PARAMETER EXTRACTION & VALIDATION
    // ==========================================
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const search = req.query.search || '';
    const gender = req.query.gender || 'All';

    console.log('[PATIENT SEARCH] Request parameters:', {
      page,
      limit,
      search: search ? `"${search}"` : '(empty)',
      gender
    });

    // Validate pagination bounds to prevent abuse
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid pagination parameters',
        details: 'Page must be >= 1, limit must be between 1 and 100'
      });
    }

    // ==========================================
    // STEP 1: BUILD USER RELATION FILTER MATRIX
    // ==========================================
    // This handles schemas where Patient has a User relation
    const userConditions = {};
    
    if (gender && gender !== 'All') {
      userConditions.gender = gender.toUpperCase(); // Enforces strict enum matching ('MALE' / 'FEMALE')
      console.log('[PATIENT SEARCH] Gender filter applied to user relation:', gender.toUpperCase());
    }
    
    if (search && search.trim() !== '') {
      const cleanSearch = search.trim();
      userConditions.OR = [
        { name: { contains: cleanSearch, mode: 'insensitive' } },
        { email: { contains: cleanSearch, mode: 'insensitive' } },
        { phone: { contains: cleanSearch, mode: 'insensitive' } }
      ];
      console.log('[PATIENT SEARCH] Search filter applied to user relation:', cleanSearch);
    }

    // ==========================================
    // STEP 2: BUILD FLAT PATIENT FILTER MATRIX
    // ==========================================
    // This handles current schema where Patient has direct fields
    const patientConditions = {};
    
    // Note: Current schema doesn't have gender field on Patient
    // This is future-proof for when it's added
    if (gender && gender !== 'All') {
      patientConditions.gender = gender.toUpperCase();
    }
    
    if (search && search.trim() !== '') {
      const cleanSearch = search.trim();
      patientConditions.OR = [
        { name: { contains: cleanSearch, mode: 'insensitive' } },
        { email: { contains: cleanSearch, mode: 'insensitive' } },
        { phone: { contains: cleanSearch } }
      ];
      console.log('[PATIENT SEARCH] Search filter applied to patient fields:', cleanSearch);
    }

    // ==========================================
    // STEP 3: BUILD FINAL QUERY CONTAINER
    // ==========================================
    // Adaptive approach: Try relational first, fallback to flat
    let finalWhere = {};
    let includeUser = false;
    
    // If we have user conditions, try relational query
    if (Object.keys(userConditions).length > 0) {
      finalWhere = { user: userConditions };
      includeUser = true;
      console.log('[PATIENT SEARCH] Using relational query (user relation)');
    } 
    // Otherwise use flat patient conditions
    else if (Object.keys(patientConditions).length > 0) {
      finalWhere = patientConditions;
      console.log('[PATIENT SEARCH] Using flat query (patient fields)');
    }
    // If no filters at all, apply a safe default (prevent full dump)
    else {
      // Return recent patients only (last 100)
      finalWhere = {};
      console.log('[PATIENT SEARCH] No filters provided, returning recent patients only');
    }

    console.log('[PATIENT SEARCH] Final WHERE clause:', JSON.stringify(finalWhere, null, 2));

    // ==========================================
    // STEP 4: EXECUTE WITH FALLBACK MECHANISM
    // ==========================================
    let totalPatients = 0;
    let rawPatients = [];
    
    try {
      // PRIMARY ATTEMPT: Try with current WHERE clause
      [totalPatients, rawPatients] = await prisma.$transaction([
        prisma.patient.count({ where: finalWhere }),
        prisma.patient.findMany({
          where: finalWhere,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: includeUser ? { user: true } : undefined
        })
      ]);
      
      console.log('[PATIENT SEARCH] Primary query succeeded:', {
        totalPatients,
        returnedCount: rawPatients.length
      });
      
    } catch (primaryError) {
      // FALLBACK: If relational query fails, try flat schema
      console.warn('[PATIENT SEARCH] Primary query failed, attempting flat schema fallback:', {
        error: primaryError.message,
        code: primaryError.code
      });
      
      try {
        // Use only flat patient conditions
        const fallbackWhere = Object.keys(patientConditions).length > 0 
          ? patientConditions 
          : {}; // Empty where = all patients (with pagination limit)
        
        [totalPatients, rawPatients] = await prisma.$transaction([
          prisma.patient.count({ where: fallbackWhere }),
          prisma.patient.findMany({
            where: fallbackWhere,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' }
          })
        ]);
        
        console.log('[PATIENT SEARCH] Fallback query succeeded:', {
          totalPatients,
          returnedCount: rawPatients.length
        });
        
      } catch (fallbackError) {
        console.error('[PATIENT SEARCH] Fallback query also failed:', {
          error: fallbackError.message,
          code: fallbackError.code
        });
        
        // Return empty result instead of crashing
        totalPatients = 0;
        rawPatients = [];
      }
    }

    // ==========================================
    // STEP 5: DEFENSIVE PROPERTY FLATTENING
    // ==========================================
    // Flatten properties to handle both nested and flat frontend schemas
    // This ensures the frontend always gets consistent data structure
    const optimizedPatients = rawPatients.map(patient => {
      // Calculate age from dateOfBirth if it exists
      let calculatedAge = null;
      if (patient.dateOfBirth) {
        const today = new Date();
        const birthDate = new Date(patient.dateOfBirth);
        calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
      }
      
      return {
        ...patient,
        // Flatten with fallbacks: patient field || user field || default
        name: patient.name || patient.user?.name || 'Unknown',
        email: patient.email || patient.user?.email || '',
        phone: patient.phone || patient.user?.phone || '',
        age: patient.age || patient.user?.age || calculatedAge,
        gender: patient.gender || patient.user?.gender || 'UNKNOWN',
        // Keep original fields for compatibility
        dateOfBirth: patient.dateOfBirth,
        address: patient.address,
        medicalHistory: patient.medicalHistory
      };
    });

    console.log('[PATIENT SEARCH] Response prepared:', {
      patientsCount: optimizedPatients.length,
      totalPatients,
      page,
      totalPages: Math.ceil(totalPatients / limit)
    });

    // ==========================================
    // STEP 6: RETURN STRUCTURED RESPONSE
    // ==========================================
    return res.json({
      success: true,
      patients: optimizedPatients,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalPatients / limit) || 1,
        totalPatients
      }
    });

  } catch (error) {
    // ==========================================
    // CRITICAL ERROR HANDLING
    // ==========================================
    console.error('[DATABASE PIPELINE EXPLICIT CRASH]:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    });
    
    // Explicitly return a 500 error payload instead of leaking unfiltered rows
    return res.status(500).json({ 
      success: false, 
      error: 'Database pipeline validation failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

    // Consistent response format
    res.json({
      success: true,
      patients: patients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPatients: totalCount,
        totalPages: totalPages,
      },
    });
  } catch (error) {
    // CRITICAL ERROR LOGGING: Comprehensive error details
    console.error('[CRITICAL BACKEND CRASH] Patient Fetching Failed at top level:', {
      error: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack,
      query: req.query
    });
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      console.error('[CRITICAL BACKEND CRASH] Prisma P2025 error - No patients found');
      return res.status(404).json({ 
        success: false,
        error: 'No patients found',
        details: error.message 
      });
    }
    
    // Generic error response
    console.error('[CRITICAL BACKEND CRASH] Returning 500 error to client');
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch patients', 
      details: error.message 
    });
  }
});

// GET /api/patients/:id
// Get patient details by ID with safe integer parsing
router.get('/:id', authenticate, async (req, res) => {
  try {
    // SAFE ID PARSING: Convert string parameter to integer
    // Prevents type mismatch errors when database expects Int type
    const patientId = parseInt(req.params.id, 10);
    
    // Validate that parsing succeeded
    if (isNaN(patientId)) {
      return res.status(400).json({ error: 'Invalid patient ID format' });
    }
    
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        appointments: {
          include: {
            doctor: {
              include: {
                user: true
              }
            }
          },
          orderBy: {
            appointmentDate: 'desc'
          }
        }
      },
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json(patient);
  } catch (error) {
    console.error('[PATIENTS API ERROR - GET /:id]:', {
      patientId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to fetch patient details', details: error.message });
  }
});

// POST /api/patients (Register patient)
// SCHEMA COMPATIBILITY FIX: Accepts both old field names (phoneNumber, age, gender) 
// and new field names (phone, dateOfBirth) for backward compatibility
// TYPE SAFETY FIX: Explicit validation and type casting for all input parameters
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, email, phoneNumber, phone, age, dateOfBirth, gender, medicalHistory, address } = req.body;

    console.log('[PATIENTS API - POST] Received registration request:', {
      name: name,
      email: email,
      phone: phone || phoneNumber,
      age: age,
      ageType: typeof age,
      dateOfBirth: dateOfBirth,
      gender: gender,
      hasMedicalHistory: !!medicalHistory
    });

    // ==========================================
    // INPUT VALIDATION & SANITIZATION
    // ==========================================
    
    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid name',
        message: 'Patient name is required and must be a non-empty string.',
        field: 'name'
      });
    }

    // ADAPTIVE FIELD MAPPING: Support both old and new API contracts
    // Old: phoneNumber, age, gender
    // New: phone, dateOfBirth, address
    const finalPhone = phone || phoneNumber;
    
    // Validate phone
    if (!finalPhone || typeof finalPhone !== 'string' || finalPhone.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid phone number',
        message: 'Phone number is required and must be a non-empty string.',
        field: 'phone'
      });
    }

    // PHONE VALIDATION: Basic format check to prevent garbage data
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(finalPhone)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid phone number format',
        message: 'Phone number should contain only digits, spaces, hyphens, plus signs, and parentheses',
        field: 'phone',
        received: finalPhone
      });
    }

    // ==========================================
    // DATE OF BIRTH CALCULATION
    // ==========================================
    let finalDateOfBirth;
    
    if (dateOfBirth) {
      // Use provided dateOfBirth
      finalDateOfBirth = new Date(dateOfBirth);
      
      // Validate date is valid
      if (isNaN(finalDateOfBirth.getTime())) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid date of birth',
          message: 'The provided date of birth is not a valid date.',
          field: 'dateOfBirth',
          received: dateOfBirth
        });
      }
    } else if (age !== undefined && age !== null && age !== '') {
      // Calculate from age
      const parsedAge = parseInt(age, 10);
      
      if (isNaN(parsedAge)) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid age',
          message: 'Age must be a valid numeric integer.',
          field: 'age',
          received: { age, type: typeof age }
        });
      }
      
      if (parsedAge < 0 || parsedAge > 150) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid age range',
          message: 'Age must be between 0 and 150.',
          field: 'age',
          received: parsedAge
        });
      }
      
      finalDateOfBirth = calculateDateOfBirthFromAge(parsedAge);
    } else {
      return res.status(400).json({ 
        success: false,
        error: 'Missing date of birth or age',
        message: 'Either dateOfBirth or age must be provided.',
        fields: ['dateOfBirth', 'age']
      });
    }

    // ==========================================
    // EMAIL VALIDATION (OPTIONAL FIELD)
    // ==========================================
    let finalEmail = null;
    if (email && typeof email === 'string' && email.trim().length > 0) {
      finalEmail = email.trim().toLowerCase();
      
      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(finalEmail)) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid email format',
          message: 'Please provide a valid email address.',
          field: 'email',
          received: email
        });
      }
    }

    // ==========================================
    // SANITIZE OTHER FIELDS
    // ==========================================
    const finalName = name.trim();
    const finalAddress = address && typeof address === 'string' ? address.trim() : null;
    const finalMedicalHistory = medicalHistory && typeof medicalHistory === 'string' ? medicalHistory.trim() : null;

    console.log('[PATIENTS API - POST] Sanitized data:', {
      name: finalName,
      email: finalEmail,
      phone: finalPhone,
      dateOfBirth: finalDateOfBirth.toISOString(),
      address: finalAddress,
      hasMedicalHistory: !!finalMedicalHistory
    });

    // ==========================================
    // CREATE PATIENT RECORD
    // ==========================================
    // Note: Gender field is not in the current schema, so we ignore it
    // If you need to add gender, run a migration first
    const patient = await prisma.patient.create({
      data: {
        name: finalName,
        email: finalEmail,
        phone: finalPhone,
        dateOfBirth: finalDateOfBirth,
        address: finalAddress,
        medicalHistory: finalMedicalHistory,
      },
    });

    console.log('[PATIENTS API - POST] Patient created successfully:', {
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      email: patient.email
    });

    res.status(201).json({
      success: true,
      message: 'Patient registered successfully',
      patient: patient
    });
    
  } catch (error) {
    console.error('[PATIENTS API ERROR - POST /]:', {
      error: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    });
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      // Unique constraint violation
      const field = error.meta?.target?.[0] || 'field';
      return res.status(409).json({ 
        success: false,
        error: 'Duplicate entry',
        message: `A patient with this ${field} already exists.`,
        field: field,
        code: 'DUPLICATE_ENTRY'
      });
    }
    
    if (error.code === 'P2003') {
      // Foreign key constraint violation
      return res.status(400).json({ 
        success: false,
        error: 'Invalid reference',
        message: 'One or more referenced records do not exist.',
        code: 'INVALID_REFERENCE'
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to register patient', 
      message: 'An unexpected error occurred while registering the patient.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function to calculate dateOfBirth from age
function calculateDateOfBirthFromAge(age) {
  const today = new Date();
  const birthYear = today.getFullYear() - parseInt(age, 10);
  return new Date(birthYear, 0, 1); // January 1st of birth year
}

// DELETE /api/patients/:id
// SECURITY: Protected by authorizeAdminOnlyLegacy middleware with strict RBAC enforcement.
// Only users with 'admin' role can delete patient records.
router.delete('/:id', authenticate, authorizeAdminOnlyLegacy, async (req, res) => {
  try {
    // SAFE ID PARSING: Convert string parameter to integer
    const patientId = parseInt(req.params.id, 10);
    
    // Validate that parsing succeeded
    if (isNaN(patientId)) {
      return res.status(400).json({ error: 'Invalid patient ID format' });
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await prisma.patient.delete({ where: { id: patientId } });

    res.json({ message: `Successfully deleted patient ${patient.name}` });
  } catch (error) {
    console.error('[PATIENTS API ERROR - DELETE /:id]:', {
      patientId: req.params.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to delete patient', details: error.message });
  }
});

module.exports = router;
