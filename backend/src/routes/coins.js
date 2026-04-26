const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { createCoin, getCoins, getCoinById, getRandomCoins, updateCoinImages, resetCoinImages, getCustomImages, getFilterOptions, getDateRanges } = require('../controllers/coinController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const optionalAuthMiddleware = require('../middlewares/optionalAuthMiddleware');
const { upload, uploadFields, processCoinImage } = require('../middlewares/upload');
const { cacheMiddleware, CACHE_CONFIG } = require('../utils/cache');
const { validateObjectId } = require('../middlewares/enhancedValidation');
const { searchLimiter, failOpen, buildRedisStore } = require('../middlewares/security');
const { CACHE_HEADERS } = require('../config/constants');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Rate limiter for expensive filter options query (Redis-backed, fail-open)
const filterOptionsLimiter = failOpen(rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: {
    error: 'Too many filter requests',
    message: 'Please try again in a moment'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: buildRedisStore('filter-options'),
  handler: (req, res) => {
    logger.security.suspiciousActivity('Filter options rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many filter requests',
      message: 'Please try again in a moment'
    });
  }
}));

// Public routes with caching and rate limiting
router.get('/', searchLimiter, cacheMiddleware(CACHE_CONFIG.SEARCH_RESULTS), getCoins);
router.get('/random', getRandomCoins);
router.get('/filter-options', filterOptionsLimiter, cacheMiddleware(CACHE_CONFIG.FILTER_OPTIONS), getFilterOptions);
router.get('/date-ranges', cacheMiddleware(CACHE_CONFIG.FILTER_OPTIONS), getDateRanges);
router.get('/:id', validateObjectId('id'), optionalAuthMiddleware, getCoinById);
// Catalog creation is admin-only: regular users must never be able to seed
// coins into the reference catalog. Protected by auth + role-check.
router.post('/', authMiddleware, adminMiddleware, createCoin);

// Protected routes
router.get('/:id/custom-images', validateObjectId('id'), authMiddleware, getCustomImages);
router.get('/:id/custom-images/obverse', validateObjectId('id'), authMiddleware, async (req, res) => {
  try {
    // Validate userId to prevent NoSQL injection (defense in depth)
    if (!mongoose.Types.ObjectId.isValid(req.user.userId)) {
      logger.security.authFailure('Invalid userId in token', {
        userId: req.user.userId,
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid authentication' });
    }
    
    const CoinCustomImage = require('../models/CoinCustomImage');
    const customImage = await CoinCustomImage.findOne({ 
      coinId: new mongoose.Types.ObjectId(req.params.id), 
      userId: new mongoose.Types.ObjectId(req.user.userId)
    }).select('obverseImageData obverseImageContentType updatedAt');

    if (!customImage || !customImage.obverseImageData) {
      return res.status(404).send('Image not found');
    }

    // Generate ETag from updatedAt timestamp for cache validation
    const etag = `"${customImage.updatedAt.getTime()}"`;
    
    // Check If-None-Match header for conditional requests
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    let imageData = customImage.obverseImageData;
    if (imageData && imageData.buffer) {
      imageData = imageData.buffer;
    }

    const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.set('Content-Type', customImage.obverseImageContentType || 'image/webp');
    res.set('Cache-Control', CACHE_HEADERS.USER_IMAGES);
    res.set('ETag', etag);
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.send(imageData);
  } catch (err) {
    logger.error('Error serving obverse image', { error: err.message });
    res.status(500).send('Server error');
  }
});
router.get('/:id/custom-images/reverse', validateObjectId('id'), authMiddleware, async (req, res) => {
  try {
    // Validate userId to prevent NoSQL injection (defense in depth)
    if (!mongoose.Types.ObjectId.isValid(req.user.userId)) {
      logger.security.authFailure('Invalid userId in token', {
        userId: req.user.userId,
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid authentication' });
    }
    
    const CoinCustomImage = require('../models/CoinCustomImage');
    const customImage = await CoinCustomImage.findOne({ 
      coinId: new mongoose.Types.ObjectId(req.params.id), 
      userId: new mongoose.Types.ObjectId(req.user.userId)
    }).select('reverseImageData reverseImageContentType updatedAt');

    if (!customImage || !customImage.reverseImageData) {
      return res.status(404).send('Image not found');
    }

    // Generate ETag from updatedAt timestamp for cache validation
    const etag = `"${customImage.updatedAt.getTime()}"`;
    
    // Check If-None-Match header for conditional requests
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    let imageData = customImage.reverseImageData;
    if (imageData && imageData.buffer) {
      imageData = imageData.buffer;
    }

    const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.set('Content-Type', customImage.reverseImageContentType || 'image/webp');
    res.set('Cache-Control', CACHE_HEADERS.USER_IMAGES);
    res.set('ETag', etag);
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.send(imageData);
  } catch (err) {
    logger.error('Error serving reverse image', { error: err.message });
    res.status(500).send('Server error');
  }
});
router.post('/:id/custom-images', validateObjectId('id'), authMiddleware, uploadFields, processCoinImage, updateCoinImages);
router.put('/:id/images', validateObjectId('id'), authMiddleware, uploadFields, processCoinImage, updateCoinImages);
router.delete('/:id/custom-images', validateObjectId('id'), authMiddleware, resetCoinImages);
router.delete('/:id/images', validateObjectId('id'), authMiddleware, resetCoinImages);

module.exports = router;