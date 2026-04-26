// Centralized error handling middleware
const logger = require('../utils/logger');
const { Sentry } = require('../config/sentry');

const errorHandler = (err, req, res, next) => {
  // Ship 5xx errors to Sentry when configured. 4xx errors are expected
  // client mistakes and don't warrant alerting.
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500 && Sentry.captureException) {
    Sentry.captureException(err, {
      extra: {
        url: req.originalUrl,
        method: req.method,
        userId: req.user?.userId,
        requestId: req.id
      }
    });
  }

  // Use structured logging instead of console.error
  logger.error('Error occurred', {
    message: err.message,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.userId,
    timestamp: new Date().toISOString(),
    // Only log stack in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => ({
      field: val.path,
      message: val.message
    }));
    return res.status(400).json({
      error: 'Validation Error',
      details: errors
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: `${field} already exists`,
      field: field
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid Token',
      message: 'Authentication failed'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token Expired',
      message: 'Please login again'
    });
  }

  // Mongoose CastError
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID',
      message: 'Invalid resource ID format'
    });
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File Too Large',
      message: 'File size exceeds the maximum allowed limit'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Invalid File',
      message: 'Unexpected file field or too many files'
    });
  }

  // Default to 500 server error
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error' 
    : err.message;

  res.status(statusCode).json({
    error: 'Server Error',
    message: message
    // Never expose stack traces to clients, even in development
  });
};

// 404 handler for undefined routes
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    method: req.method
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};
