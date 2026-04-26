/**
 * Enhanced logging utility for NumisRoma
 * Provides structured logging without interfering with existing functionality
 */

const winston = require('winston');
require('winston-daily-rotate-file');

// Create logger only if winston is available, otherwise fallback to console
let logger;

try {
  const transports = [
    new winston.transports.Console({
      // Tests intentionally hit error paths; logging those as "errors" is noisy
      // and looks like failures. Production/dev still log normally.
      silent: process.env.NODE_ENV === 'test',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ];

  // Rotating file logs in production — keeps 14 days, caps each file at 20 MB
  // so a traffic spike can't exhaust disk before the next rotation.
  if (process.env.NODE_ENV === 'production') {
    const rotateBase = {
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m',
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    };
    transports.push(
      new winston.transports.DailyRotateFile({
        ...rotateBase,
        filename: 'logs/error-%DATE%.log',
        level: 'error'
      }),
      new winston.transports.DailyRotateFile({
        ...rotateBase,
        filename: 'logs/combined-%DATE%.log'
      })
    );
  }

  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'numisroma-backend' },
    transports
  });
} catch (error) {
  // Fallback to console if winston fails
  logger = console;
}

/**
 * Safe logger that falls back to console if winston is not available
 */
const safeLogger = {
  info: (message, meta = {}) => {
    if (logger.info && typeof logger.info === 'function') {
      logger.info(message, meta);
    } else {
      console.log(`[INFO] ${message}`, meta);
    }
  },

  error: (message, meta = {}) => {
    if (logger.error && typeof logger.error === 'function') {
      logger.error(message, meta);
    } else {
      console.error(`[ERROR] ${message}`, meta);
    }
  },

  warn: (message, meta = {}) => {
    if (logger.warn && typeof logger.warn === 'function') {
      logger.warn(message, meta);
    } else {
      console.warn(`[WARN] ${message}`, meta);
    }
  },

  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      if (logger.debug && typeof logger.debug === 'function') {
        logger.debug(message, meta);
      } else {
        console.debug(`[DEBUG] ${message}`, meta);
      }
    }
  },

  // Database specific logging
  database: {
    connection: (status, details = {}) => {
      safeLogger.info(`Database connection: ${status}`, details);
    },
    
    query: (query, duration = null) => {
      if (process.env.LOG_QUERIES === 'true') {
        safeLogger.debug(`Database query executed`, { query, duration });
      }
    },
    
    error: (error, context = {}) => {
      safeLogger.error('Database error', { error: error.message, stack: error.stack, ...context });
    }
  },

  // API specific logging
  api: {
    request: (method, url, userId = null) => {
      safeLogger.info(`API Request: ${method} ${url}`, { userId });
    },
    
    error: (error, context = {}) => {
      safeLogger.error('API error', { 
        error: error.message, 
        stack: error.stack, 
        ...context 
      });
    }
  },

  // Security specific logging
  security: {
    authFailure: (reason, context = {}) => {
      safeLogger.warn(`Authentication failure: ${reason}`, context);
    },
    
    suspiciousActivity: (activity, context = {}) => {
      safeLogger.warn(`Suspicious activity: ${activity}`, context);
    }
  }
};

module.exports = safeLogger;
