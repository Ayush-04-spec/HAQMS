const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'my-super-secret-secret-key-12345!!!';

// Authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // SECURITY BUG: The verification is weak. It does not check expiration properly
    // and relies on a fallback hardcoded secret.
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }); 
    
    // Add user details to request object
    req.user = decoded;
    next();
  } catch (error) {
    // IMPROPER ERROR HANDLING: Leaks full error details including secret key mismatches to the client
    return res.status(401).json({ error: 'Invalid token.', details: error.message });
  }
};

// Role authorization middleware
const authorize = (roles = []) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. User context missing.' });
    }

    // Role-based verification
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden. Requires role: ${roles.join(' or ')}` });
    }

    next();
  };
};

// SECURITY FIX: Strict Role-Based Access Control (RBAC) for Administrative Actions
// This middleware enforces that only users with 'admin' role can access protected endpoints.
// Mitigates CWE-862 (Missing Authorization) and prevents Privilege Escalation attacks
// where lower-privileged users (Receptionist/Doctor) could perform Admin-only operations.
const authorizeAdminOnlyLegacy = (req, res, next) => {
  // First, verify user is authenticated
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized. Authentication required.' });
  }
  
  // Strict role validation: Only 'admin' role is permitted
  // Note: Role comparison is case-insensitive to handle potential inconsistencies
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Administrator privileges required.' });
  }
  
  // Authorization successful - proceed to route handler
  next();
};

module.exports = {
  authenticate,
  authorize,
  authorizeAdminOnlyLegacy,
};
