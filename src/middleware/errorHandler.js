const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // 1. Log the full error for developers
  logger.error(`${err.name}: ${err.message}`, { 
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body 
  });

  // 2. Handle Sequelize Validation Errors (e.g., balance can't be negative)
  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map(e => ({
      field: e.path,
      message: e.message
    }));
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid input data', 
      details: errors 
    });
  }

  // 3. Handle Duplicate Entries (e.g., email already exists)
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ 
      success: false, 
      error: 'The resource you are trying to create already exists' 
    });
  }

  // 4. Handle JWT Specific Errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, error: 'Invalid authentication token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, error: 'Session expired. Please login again.' });
  }

  // 5. Handle Custom Application Errors (thrown with err.statusCode)
  const statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // 6. Production Guard: Don't leak raw system errors
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'An unexpected system error occurred. Our engineers have been notified.';
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { errorHandler };