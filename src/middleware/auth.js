const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Primary Authentication Middleware
 * Optimized for TradePro Dashboard Access
 */
const protect = async (req, res, next) => {
  try {
    // Area of change: Ensure session exists before accessing token
    const token = (req.session && req.session.token) ? req.session.token : null;
    
    console.log("===================================");
    console.log(`[AUTH CHECK] Path: ${req.originalUrl} | Token: ${token ? "Present" : "Missing"}`);

    if (!token) {
      // AREA OF CHANGE: Improved redirect logic for browser-based dashboard access
      const isBrowserRequest = req.headers.accept?.includes('text/html');
      
      if (isBrowserRequest) {
        console.log("[AUTH] No token, redirecting browser to /signin");
        return res.redirect('/signin');
      }
      
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required. Please log in.' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Area of change: Find user and include only necessary fields for speed
    const user = await User.findByPk(decoded.id);
    
    if (!user) {
      console.log("[AUTH] Token valid but user not found in database.");
      if (req.session) req.session.token = null;
      return res.redirect('/signin');
    }

    if (user.status !== 'active') {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is deactivated.' 
      });
    }

    // Attach user to request
    req.user = user;
    req.token = token;
    
    // AREA OF CHANGE: Make user data available to EJS templates automatically
    res.locals.user = user; 
    
    next();
  } catch (error) {
    // AREA OF CHANGE: Enhanced error handling for expired or malformed tokens
    if (req.session) req.session.token = null;

    if (error.name === 'TokenExpiredError') {
      logger.warn(`Session expired for user at ${req.ip}`);
      if (req.headers.accept?.includes('text/html')) {
        return res.redirect('/signin?error=expired');
      }
      return res.status(401).json({ success: false, message: 'Session expired' });
    }
    
    logger.error(`Auth Middleware Error: ${error.message}`);
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/signin');
    }
    res.status(401).json({ success: false, message: 'Invalid session' });
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
      
      // AREA OF CHANGE: Handle HTML requests for unauthorized roles
      if (req.headers.accept?.includes('text/html')) {
        return res.status(403).send('Access Denied: You do not have permission to view this page.');
      }
      
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: Insufficient permissions' 
      });
    }

    next();
  };
};

const admin = checkRole('admin');

module.exports = {
  protect,
  checkRole,
  admin 
};