const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Primary Authentication Middleware
 * Area of change: Cleaned up syntax and improved API vs Frontend response logic
 */
const protect = async (req, res, next) => {
  try {
    // Area of change: Safe access to session token
    const token = req.session ? req.session.token : null;
    
    console.log("===================================");
    console.log("Session Token Check:", token ? "Token Found" : "No Token");

    if (!token) {
      // Area of change: Only redirect if it's a direct browser page request
      if (req.headers.accept?.includes('text/html') && !req.xhr) {
        return res.redirect('/signin');
      }
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Verify token using secret from environment
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    // Check 'status' column
    if (user.status !== 'active') {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is deactivated. Please contact support.' 
      });
    }

    // Attach user to request object for use in controllers/EJS
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      // Area of change: Clear expired session and handle response type
      if (req.session) req.session.token = null;
      
      if (req.headers.accept?.includes('text/html') && !req.xhr) {
        return res.redirect('/signin');
      }
      return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    }
    
    logger.error(`Auth Middleware Error: ${error.message}`);
    res.status(401).json({ success: false, message: 'Invalid authentication token' });
  }
};

/**
 * Role Authorization Middleware
 */
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by ${req.user.email} on ${req.originalUrl}`);
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: Insufficient permissions' 
      });
    }

    next();
  };
};

// Exported admin role check
const admin = checkRole('admin');

module.exports = {
  protect,
  checkRole,
  admin 
};