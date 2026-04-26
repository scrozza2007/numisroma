/**
 * Admin-only route gating.
 *
 * Two paths are accepted:
 *   1. A request authenticated via `authMiddleware` whose user has
 *      `role === 'admin'` in the database.
 *   2. A request bearing a matching `X-Admin-API-Key` header where the
 *      header value === `process.env.ADMIN_API_KEY` (must be a strong
 *      secret, only set in environments that actually need operational
 *      break-glass access).
 *
 * Unauthorized admin attempts are logged via `logger.security` so they
 * can be alerted on in production.
 *
 * Must be mounted AFTER `authMiddleware` for the role-based path to see
 * `req.user`.
 */

const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');
const { ErrorResponse } = require('../utils/errorResponse');

// Timing-safe string comparison guards against header-timing attacks.
const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const adminMiddleware = async (req, res, next) => {
  // 1. API-key path (operational / CI / internal callers).
  const providedKey = req.header('X-Admin-API-Key');
  const configuredKey = process.env.ADMIN_API_KEY;
  if (configuredKey && providedKey && timingSafeEqual(providedKey, configuredKey)) {
    req.isAdmin = true;
    req.adminSource = 'api_key';
    return next();
  }

  // 2. Role-based path (logged-in user with role === 'admin').
  if (!req.user || !req.user.userId) {
    logger.security.authFailure('Admin route accessed without auth', {
      url: req.originalUrl,
      ip: req.ip
    });
    return ErrorResponse.unauthorized(res, 'Authentication required');
  }

  try {
    // Select only the role field to minimize over-fetch.
    const user = await User.findById(req.user.userId).select('role').lean();
    if (!user || user.role !== 'admin') {
      logger.security.suspiciousActivity('Non-admin attempted admin route', {
        userId: req.user.userId,
        role: user?.role || 'unknown',
        url: req.originalUrl,
        ip: req.ip
      });
      return ErrorResponse.forbidden(res, 'Admin access required');
    }

    req.isAdmin = true;
    req.adminSource = 'user_role';
    next();
  } catch (err) {
    logger.error('Admin middleware error', {
      error: err.message,
      userId: req.user?.userId
    });
    return ErrorResponse.serverError(res, 'Authorization check failed');
  }
};

module.exports = adminMiddleware;
