const express = require('express');
const mongoose = require('mongoose');
const { checkDatabaseHealth, getDatabaseStats } = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const logger = require('../utils/logger');
const router = express.Router();

// Basic health check endpoint
router.get('/', (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  };
  
  res.status(200).json(healthCheck);
});

// Detailed health check with database status.
// Admin-gated: internal-only. Exposes memory/collections counts that are not
// safe to broadcast publicly.
router.get('/detailed', authMiddleware, adminMiddleware, async (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'unknown',
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024, // MB
        total: process.memoryUsage().heapTotal / 1024 / 1024 // MB
      }
    }
  };

  try {
    // Check database connection
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    healthCheck.services.database = dbStates[dbState] || 'unknown';
    
    // If connected, get some basic stats
    if (dbState === 1) {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      healthCheck.services.database_collections = collections.length;
    }

    const status = healthCheck.services.database === 'connected' ? 200 : 503;
    res.status(status).json(healthCheck);
    
  } catch (error) {
    healthCheck.services.database = 'error';
    healthCheck.error = error.message;
    res.status(503).json(healthCheck);
  }
});

// Ready endpoint (for Kubernetes readiness probes)
router.get('/ready', async (req, res) => {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        status: 'not ready', 
        reason: 'database not connected' 
      });
    }
    
    res.status(200).json({ 
      status: 'ready',
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'not ready', 
      error: error.message 
    });
  }
});

// Live endpoint (for Kubernetes liveness probes)
router.get('/live', (req, res) => {
  res.status(200).json({ 
    status: 'alive',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Advanced health check endpoint with database statistics.
// Admin-gated: exposes DB stats / memory / CPU which are reconnaissance aids.
router.get('/advanced', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [dbHealth, dbStats] = await Promise.all([
      checkDatabaseHealth(),
      getDatabaseStats()
    ]);

    const healthCheck = {
      uptime: process.uptime(),
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      database: dbHealth,
      statistics: dbStats,
      memory: {
        used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100, // MB
        total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100, // MB
        rss: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100 // MB
      },
      cpu: {
        usage: process.cpuUsage()
      }
    };

    // Log health check access in development
    if (process.env.NODE_ENV === 'development') {
      logger.info('Advanced health check accessed', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    }

    res.status(200).json(healthCheck);
  } catch (error) {
    logger.error('Advanced health check failed', { error: error.message });
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message,
      timestamp: Date.now()
    });
  }
});

module.exports = router;
