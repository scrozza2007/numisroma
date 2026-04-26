/**
 * Cache management routes for NumisRoma
 * Administrative endpoints for cache monitoring and management
 */

const express = require('express');
const router = express.Router();
const { cache, cacheHelpers } = require('../utils/cache');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const logger = require('../utils/logger');

/**
 * GET /cache/stats - Get cache statistics
 */
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await cache.getStats();
    
    logger.info('Cache stats requested', { 
      userId: req.user.userId,
      cacheType: stats.type 
    });
    
    res.json({
      status: 'success',
      data: stats,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Failed to get cache stats', { 
      error: error.message,
      userId: req.user.userId 
    });
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve cache statistics',
      error: error.message
    });
  }
});

/**
 * POST /cache/clear - Clear cache by pattern
 */
router.post('/clear', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { pattern = '*', type } = req.body;
    
    let cleared = false;
    let message = '';
    
    if (type) {
      // Clear specific cache type
      switch (type) {
        case 'coins':
          cleared = await cacheHelpers.coins.clear();
          message = 'Coins cache cleared';
          break;
        case 'collections':
          cleared = await cacheHelpers.collections.clear();
          message = 'Collections cache cleared';
          break;
        case 'users':
          cleared = await cacheHelpers.users.clear();
          message = 'Users cache cleared';
          break;
        case 'search':
          cleared = await cacheHelpers.search.clear();
          message = 'Search cache cleared';
          break;
        case 'filters':
          cleared = await cacheHelpers.filters.clear();
          message = 'Filter options cache cleared';
          break;
        case 'all':
          cleared = await cache.clear('*');
          message = 'All cache cleared';
          break;
        default:
          return res.status(400).json({
            status: 'error',
            message: 'Invalid cache type. Valid types: coins, collections, users, search, filters, all'
          });
      }
    } else {
      // Clear by pattern
      cleared = await cache.clear(pattern);
      message = `Cache cleared for pattern: ${pattern}`;
    }
    
    logger.info('Cache cleared', { 
      userId: req.user.userId,
      pattern,
      type,
      success: cleared
    });
    
    res.json({
      status: 'success',
      message,
      cleared,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Failed to clear cache', { 
      error: error.message,
      userId: req.user.userId 
    });
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to clear cache',
      error: error.message
    });
  }
});

/**
 * POST /cache/warm - Warm up cache with frequently accessed data
 */
router.post('/warm', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { types = ['filters'] } = req.body;
    const results = {};
    
    logger.info('Cache warm-up started', { 
      userId: req.user.userId,
      types 
    });
    
    // Import controllers for cache warming
    const { getFilterOptions } = require('../controllers/coinController');
    
    for (const type of types) {
      switch (type) {
        case 'filters':
          try {
            // Simulate request to warm filter cache
            const mockReq = {};
            const mockRes = {
              json: (data) => {
                results.filters = 'warmed';
                return data;
              },
              status: (code) => mockRes
            };
            
            await getFilterOptions(mockReq, mockRes);
            results.filters = 'success';
          } catch (err) {
            results.filters = `error: ${err.message}`;
          }
          break;
          
        default:
          results[type] = 'unsupported';
      }
    }
    
    logger.info('Cache warm-up completed', { 
      userId: req.user.userId,
      results 
    });
    
    res.json({
      status: 'success',
      message: 'Cache warm-up completed',
      results,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Cache warm-up failed', { 
      error: error.message,
      userId: req.user.userId 
    });
    
    res.status(500).json({
      status: 'error',
      message: 'Cache warm-up failed',
      error: error.message
    });
  }
});

/**
 * GET /cache/health - Check cache system health
 * Admin-gated: do not expose infrastructure state to the public internet.
 */
router.get('/health', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await cache.getStats();
    
    const health = {
      status: stats.connected ? 'healthy' : 'unhealthy',
      type: stats.type,
      connected: stats.connected,
      timestamp: Date.now()
    };
    
    if (stats.error) {
      health.error = stats.error;
    }
    
    const statusCode = stats.connected ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      type: 'unknown',
      connected: false,
      error: error.message,
      timestamp: Date.now()
    });
  }
});

module.exports = router;
