/**
 * Intelligent caching system for NumisRoma
 * Supports Redis with graceful fallback to in-memory caching
 */

const logger = require('./logger');

// Try to load Redis, but don't fail if it's not available
let redis;
let redisClient;

try {
  redis = require('redis');
  
  // Create Redis client with error handling
  if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.warn('Redis connection refused, falling back to memory cache');
          return undefined; // Don't retry
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('Redis retry time exhausted');
          return undefined;
        }
        if (options.attempt > 10) {
          logger.error('Redis max retry attempts reached');
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    redisClient.on('error', (err) => {
      logger.warn('Redis client error, using memory cache', { error: err.message });
      redisClient = null; // Fall back to memory cache
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('ready', () => {
      logger.info('Redis ready for operations');
    });

    // Connect to Redis
    if (redisClient) {
      redisClient.connect().catch((err) => {
        logger.warn('Failed to connect to Redis, using memory cache', { error: err.message });
        redisClient = null;
      });
    }
  }
} catch (error) {
  logger.info('Redis not available, using in-memory cache', { error: error.message });
  redis = null;
  redisClient = null;
}

// In-memory cache fallback
const memoryCache = new Map();
const cacheExpiry = new Map();

// Maximum cache entries to prevent unbounded growth
const MAX_CACHE_ENTRIES = 10000;

/**
 * Clean expired entries from memory cache
 */
const cleanExpiredMemoryCache = () => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, expiry] of cacheExpiry.entries()) {
    if (now > expiry) {
      memoryCache.delete(key);
      cacheExpiry.delete(key);
      cleanedCount++;
    }
  }
  
  // If cache is still too large, remove oldest entries (LRU-style)
  if (memoryCache.size > MAX_CACHE_ENTRIES) {
    const sortedEntries = Array.from(cacheExpiry.entries())
      .sort((a, b) => a[1] - b[1]) // Sort by expiry time
      .slice(0, memoryCache.size - MAX_CACHE_ENTRIES);
    
    sortedEntries.forEach(([key]) => {
      memoryCache.delete(key);
      cacheExpiry.delete(key);
      cleanedCount++;
    });
    
    logger.warn('Memory cache size exceeded maximum, evicted oldest entries', {
      evicted: sortedEntries.length,
      remaining: memoryCache.size
    });
  }
  
  if (cleanedCount > 0) {
    logger.debug('Memory cache cleanup completed', { 
      cleaned: cleanedCount,
      remaining: memoryCache.size 
    });
  }
};

// Clean memory cache every 5 minutes (skip in Jest — interval keeps the process alive)
let cacheCleanupInterval = null;
if (process.env.NODE_ENV !== 'test') {
  cacheCleanupInterval = setInterval(cleanExpiredMemoryCache, 5 * 60 * 1000);
}

const clearCacheCleanupInterval = () => {
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
    logger.info('Cache cleanup interval cleared');
  }
};

process.on('SIGTERM', clearCacheCleanupInterval);
process.on('SIGINT', clearCacheCleanupInterval);

/**
 * Cache configuration
 */
const CACHE_CONFIG = {
  // Default TTL in seconds
  DEFAULT_TTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 300, // 5 minutes
  
  // Specific TTLs for different data types
  COINS: parseInt(process.env.CACHE_COINS_TTL) || 600, // 10 minutes
  COLLECTIONS: parseInt(process.env.CACHE_COLLECTIONS_TTL) || 300, // 5 minutes
  USERS: parseInt(process.env.CACHE_USERS_TTL) || 900, // 15 minutes
  SEARCH_RESULTS: parseInt(process.env.CACHE_SEARCH_TTL) || 180, // 3 minutes
  FILTER_OPTIONS: parseInt(process.env.CACHE_FILTERS_TTL) || 1800, // 30 minutes
  
  // Cache prefixes for namespacing
  PREFIXES: {
    COIN: 'coin:',
    COLLECTION: 'collection:',
    USER: 'user:',
    SEARCH: 'search:',
    FILTERS: 'filters:',
    HEALTH: 'health:',
    STATS: 'stats:'
  }
};

/**
 * Generate cache key with prefix
 */
const generateKey = (prefix, key) => {
  return `numisroma:${prefix}${key}`;
};

/**
 * Cache implementation with Redis/Memory fallback
 */
class CacheManager {
  /**
   * Set a value in cache
   */
  async set(key, value, ttl = CACHE_CONFIG.DEFAULT_TTL) {
    try {
      const serializedValue = JSON.stringify(value);
      
      if (redisClient && redisClient.isReady) {
        await redisClient.setEx(key, ttl, serializedValue);
        logger.debug('Cached to Redis', { key, ttl });
      } else {
        // Fallback to memory cache
        memoryCache.set(key, serializedValue);
        cacheExpiry.set(key, Date.now() + (ttl * 1000));
        logger.debug('Cached to memory', { key, ttl });
      }
      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get a value from cache
   */
  async get(key) {
    try {
      let value = null;
      
      if (redisClient && redisClient.isReady) {
        value = await redisClient.get(key);
        if (value) {
          logger.debug('Cache hit (Redis)', { key });
        }
      } else {
        // Fallback to memory cache
        const now = Date.now();
        const expiry = cacheExpiry.get(key);
        
        if (expiry && now <= expiry) {
          value = memoryCache.get(key);
          if (value) {
            logger.debug('Cache hit (memory)', { key });
          }
        } else if (expiry) {
          // Expired
          memoryCache.delete(key);
          cacheExpiry.delete(key);
        }
      }
      
      if (!value) {
        logger.debug('Cache miss', { key });
        return null;
      }
      
      return JSON.parse(value);
    } catch (error) {
      logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key) {
    try {
      if (redisClient && redisClient.isReady) {
        await redisClient.del(key);
        logger.debug('Deleted from Redis cache', { key });
      } else {
        memoryCache.delete(key);
        cacheExpiry.delete(key);
        logger.debug('Deleted from memory cache', { key });
      }
      return true;
    } catch (error) {
      logger.error('Cache delete error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Clear cache by pattern.
   *
   * IMPORTANT: Uses Redis SCAN (not KEYS) and UNLINK (not DEL) so this method
   * is safe on large keyspaces in production. `KEYS` blocks Redis for the
   * full O(N) scan; `SCAN` returns in bounded chunks and `UNLINK` reclaims
   * memory asynchronously.
   */
  async clear(pattern = '*') {
    try {
      if (redisClient && redisClient.isReady) {
        let cursor = 0;
        let total = 0;
        // node-redis v4 uses 0-based cursor; `scanIterator` would also work
        // but we keep an explicit loop for compatibility with older clients.
        do {
          const reply = await redisClient.scan(cursor, {
            MATCH: pattern,
            COUNT: 500
          });
          // node-redis v4 returns `{ cursor, keys }`; some older typings use
          // `[cursor, keys]`. Support both.
          const nextCursor = reply.cursor !== undefined ? reply.cursor : reply[0];
          const batch = reply.keys !== undefined ? reply.keys : reply[1];
          cursor = Number(nextCursor);
          if (batch && batch.length > 0) {
            // UNLINK > DEL: frees memory asynchronously, non-blocking.
            if (typeof redisClient.unlink === 'function') {
              await redisClient.unlink(batch);
            } else {
              await redisClient.del(batch);
            }
            total += batch.length;
          }
        } while (cursor !== 0);
        if (total > 0) {
          logger.info('Cleared Redis cache', { pattern, count: total });
        }
      } else {
        // Clear memory cache
        if (pattern === '*') {
          memoryCache.clear();
          cacheExpiry.clear();
          logger.info('Cleared memory cache');
        } else {
          // Pattern matching for memory cache
          const keysToDelete = [];
          for (const key of memoryCache.keys()) {
            if (key.includes(pattern.replace('*', ''))) {
              keysToDelete.push(key);
            }
          }
          
          keysToDelete.forEach(key => {
            memoryCache.delete(key);
            cacheExpiry.delete(key);
          });
          
          logger.info('Cleared memory cache', { pattern, count: keysToDelete.length });
        }
      }
      return true;
    } catch (error) {
      logger.error('Cache clear error', { pattern, error: error.message });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      if (redisClient && redisClient.isReady) {
        const info = await redisClient.info('memory');
        const keyspace = await redisClient.info('keyspace');
        return {
          type: 'redis',
          connected: true,
          memory: info,
          keyspace: keyspace
        };
      } else {
        return {
          type: 'memory',
          connected: true,
          keys: memoryCache.size,
          memoryUsage: process.memoryUsage()
        };
      }
    } catch (error) {
      logger.error('Cache stats error', { error: error.message });
      return {
        type: 'unknown',
        connected: false,
        error: error.message
      };
    }
  }
}

// Create cache manager instance
const cache = new CacheManager();

/**
 * High-level caching functions for specific data types
 */
const cacheHelpers = {
  // Coin caching
  coins: {
    get: (id) => cache.get(generateKey(CACHE_CONFIG.PREFIXES.COIN, id)),
    set: (id, data) => cache.set(generateKey(CACHE_CONFIG.PREFIXES.COIN, id), data, CACHE_CONFIG.COINS),
    del: (id) => cache.del(generateKey(CACHE_CONFIG.PREFIXES.COIN, id)),
    clear: () => cache.clear(generateKey(CACHE_CONFIG.PREFIXES.COIN, '*'))
  },

  // Collection caching
  collections: {
    get: (id) => cache.get(generateKey(CACHE_CONFIG.PREFIXES.COLLECTION, id)),
    set: (id, data) => cache.set(generateKey(CACHE_CONFIG.PREFIXES.COLLECTION, id), data, CACHE_CONFIG.COLLECTIONS),
    del: (id) => cache.del(generateKey(CACHE_CONFIG.PREFIXES.COLLECTION, id)),
    clear: () => cache.clear(generateKey(CACHE_CONFIG.PREFIXES.COLLECTION, '*'))
  },

  // User caching
  users: {
    get: (id) => cache.get(generateKey(CACHE_CONFIG.PREFIXES.USER, id)),
    set: (id, data) => cache.set(generateKey(CACHE_CONFIG.PREFIXES.USER, id), data, CACHE_CONFIG.USERS),
    del: (id) => cache.del(generateKey(CACHE_CONFIG.PREFIXES.USER, id)),
    clear: () => cache.clear(generateKey(CACHE_CONFIG.PREFIXES.USER, '*'))
  },

  // Search results caching
  search: {
    get: (query) => cache.get(generateKey(CACHE_CONFIG.PREFIXES.SEARCH, Buffer.from(query).toString('base64'))),
    set: (query, data) => cache.set(generateKey(CACHE_CONFIG.PREFIXES.SEARCH, Buffer.from(query).toString('base64')), data, CACHE_CONFIG.SEARCH_RESULTS),
    clear: () => cache.clear(generateKey(CACHE_CONFIG.PREFIXES.SEARCH, '*'))
  },

  // Filter options caching
  filters: {
    get: (type) => cache.get(generateKey(CACHE_CONFIG.PREFIXES.FILTERS, type)),
    set: (type, data) => cache.set(generateKey(CACHE_CONFIG.PREFIXES.FILTERS, type), data, CACHE_CONFIG.FILTER_OPTIONS),
    clear: () => cache.clear(generateKey(CACHE_CONFIG.PREFIXES.FILTERS, '*'))
  },

  // HTTP API response cache (written by `cacheMiddleware`). Admin writes
  // that change catalog data MUST call `api.clear()` so stale list/filter
  // responses don't linger until TTL expires.
  api: {
    clear: () => cache.clear('numisroma:api:*')
  }
};

/**
 * Cache middleware for Express routes
 */
const cacheMiddleware = (ttl = CACHE_CONFIG.DEFAULT_TTL, keyGenerator = null) => {
  return async (req, res, next) => {
    // Skip caching for authenticated requests by default
    if (req.user && !keyGenerator) {
      return next();
    }

    const key = keyGenerator ? keyGenerator(req) : `${req.method}:${req.originalUrl}`;
    const cacheKey = generateKey('api:', key);

    try {
      const cachedData = await cache.get(cacheKey);
      if (cachedData) {
        logger.debug('API cache hit', { key: cacheKey });
        return res.json(cachedData);
      }

      // Store original res.json to intercept response
      const originalJson = res.json;
      res.json = function(data) {
        // Cache successful responses only
        if (res.statusCode === 200) {
          cache.set(cacheKey, data, ttl).catch(err => 
            logger.error('Failed to cache response', { key: cacheKey, error: err.message })
          );
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error', { error: error.message });
      next();
    }
  };
};

/**
 * Returns the underlying Redis client if it's connected and ready, otherwise null.
 * Callers should treat a null return as "Redis unavailable" and fall back gracefully.
 */
const getRedisClient = () => {
  if (redisClient && redisClient.isReady) {
    return redisClient;
  }
  return null;
};

/**
 * Returns true only when Redis is connected and ready for commands.
 */
const isRedisReady = () => Boolean(redisClient && redisClient.isReady);

module.exports = {
  cache,
  cacheHelpers,
  cacheMiddleware,
  CACHE_CONFIG,
  generateKey,
  getRedisClient,
  isRedisReady
};
