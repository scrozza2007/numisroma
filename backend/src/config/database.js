/**
 * Enhanced database configuration for NumisRoma
 * Provides optimized MongoDB connection settings
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Enhanced MongoDB connection options
 */
const getConnectionOptions = () => {
  const baseOptions = {
    // Connection pool settings
    maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
    minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 2,
    maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME) || 30000,
    
    // Timeout settings
    serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT) || 5000,
    socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT) || 45000,
    connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT) || 10000,
    
    // Retry settings
    retryWrites: true,
    retryReads: true,
    
    // Monitoring
    monitorCommands: process.env.NODE_ENV === 'development'
  };

  return baseOptions;
};

/**
 * Enhanced database connection with improved error handling and monitoring
 */
const connectDatabase = async (uri = process.env.MONGODB_URI) => {
  try {
    const options = getConnectionOptions();
    
    logger.info('Connecting to MongoDB...', { 
      uri: uri?.replace(/\/\/.*@/, '//***:***@'), // Hide credentials in logs
      options: { ...options, monitorCommands: undefined } // Don't log monitoring setting
    });

    await mongoose.connect(uri, options);
    
    logger.database.connection('connected', {
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    });

    return mongoose.connection;
  } catch (error) {
    logger.database.error(error, { context: 'Initial connection failed' });
    throw error;
  }
};

/**
 * Setup database event listeners for monitoring
 */
const setupDatabaseMonitoring = () => {
  const connection = mongoose.connection;

  // Connection events
  connection.on('connected', () => {
    logger.database.connection('connected');
  });

  connection.on('disconnected', () => {
    logger.database.connection('disconnected');
  });

  connection.on('reconnected', () => {
    logger.database.connection('reconnected');
  });

  connection.on('error', (error) => {
    logger.database.error(error, { context: 'Connection error' });
  });

  // Monitor slow queries in development
  if (process.env.NODE_ENV === 'development' && process.env.LOG_QUERIES === 'true') {
    connection.on('commandStarted', (event) => {
      logger.database.query(`Command started: ${event.commandName}`, {
        command: event.command,
        requestId: event.requestId
      });
    });

    connection.on('commandSucceeded', (event) => {
      if (event.duration > 100) { // Log queries taking more than 100ms
        logger.warn('Slow query detected', {
          commandName: event.commandName,
          duration: event.duration,
          requestId: event.requestId
        });
      }
    });

    connection.on('commandFailed', (event) => {
      logger.database.error(new Error(`Command failed: ${event.failure}`), {
        commandName: event.commandName,
        duration: event.duration,
        requestId: event.requestId
      });
    });
  }
};

/**
 * Graceful database disconnection
 */
const disconnectDatabase = async () => {
  try {
    await mongoose.connection.close();
    logger.database.connection('disconnected gracefully');
  } catch (error) {
    logger.database.error(error, { context: 'Graceful disconnection failed' });
    throw error;
  }
};

/**
 * Database health check
 */
const checkDatabaseHealth = async () => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    const health = {
      status: states[state] || 'unknown',
      readyState: state,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      collections: Object.keys(mongoose.connection.collections).length
    };

    if (state === 1) {
      // Test with a simple ping
      await mongoose.connection.db.admin().ping();
      health.ping = 'success';
    }

    return health;
  } catch (error) {
    logger.database.error(error, { context: 'Health check failed' });
    return {
      status: 'error',
      error: error.message
    };
  }
};

/**
 * Get database statistics
 */
const getDatabaseStats = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { error: 'Database not connected' };
    }

    const stats = await mongoose.connection.db.stats();
    return {
      collections: stats.collections,
      dataSize: stats.dataSize,
      storageSize: stats.storageSize,
      indexes: stats.indexes,
      indexSize: stats.indexSize,
      objects: stats.objects
    };
  } catch (error) {
    logger.database.error(error, { context: 'Failed to get database stats' });
    return { error: error.message };
  }
};

module.exports = {
  connectDatabase,
  disconnectDatabase,
  setupDatabaseMonitoring,
  checkDatabaseHealth,
  getDatabaseStats,
  getConnectionOptions
};
