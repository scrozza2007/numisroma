const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const logger = require('../utils/logger');
const { hashToken } = require('../utils/tokenManager');

/**
 * Extract the JWT from the request.
 *
 * Precedence:
 *   1. httpOnly cookie `token` — preferred for browser clients (XSS-resistant).
 *   2. `Authorization: Bearer <token>` header — for non-browser clients that
 *      cannot rely on cookies.
 *
 * Records which source the token came from on the request, so downstream
 * middleware (e.g. CSRF) can decide whether to apply cookie-specific protections.
 */
const extractToken = (req) => {
  // 1. Prefer httpOnly cookie when cookie-parser is mounted
  if (req.cookies && typeof req.cookies.token === 'string' && req.cookies.token.length > 0) {
    return { token: req.cookies.token, source: 'cookie' };
  }

  // 2. Fallback: Authorization header
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      return { token, source: 'header' };
    }
  }

  return { token: null, source: null };
};

const authMiddleware = async (req, res, next) => {
  const { token, source } = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Missing token, access denied',
      message: 'Missing token, access denied',
      msg: 'Missing token, access denied'
    });
  }

  try {
    // Pin to HS256 to prevent algorithm-confusion attacks where a crafted
    // JWT header asks for `none` or RS256-with-public-key-as-HMAC-secret.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    // Lookup by hash — the DB stores SHA-256(token), never the plaintext
    const session = await Session.findOne({ token: hashToken(token), isActive: true });

    if (!session) {
      return res.status(401).json({
        error: 'Session terminated',
        message: 'Session terminated',
        msg: 'Session terminated',
        code: 'SESSION_TERMINATED',
        sessionTerminated: true
      });
    }

    // Update session last activity with throttling to reduce DB load
    // Only update if last update was more than 1 minute ago
    const now = new Date();
    const lastUpdateThreshold = new Date(now.getTime() - 60000); // 1 minute

    if (session.lastActive < lastUpdateThreshold) {
      // Fire-and-forget update with condition to prevent race conditions
      Session.updateOne(
        {
          _id: session._id,
          isActive: true,
          lastActive: { $lt: lastUpdateThreshold }
        },
        { $set: { lastActive: now } }
      ).exec().catch(err =>
        logger.error('Failed to update session lastActive', {
          sessionId: session._id,
          error: err.message
        })
      );
    }

    // Set userId in the request for controllers
    req.user = {
      userId: decoded.userId,
      _id: decoded.userId,
      sessionId: session._id
    };

    // Record auth source so other middleware (CSRF) can act accordingly
    req.authSource = source;

    next();
  } catch (err) {
    logger.security.authFailure('JWT verification failed', { error: err.message, source });
    res.status(401).json({
      error: 'Invalid token, access denied',
      message: 'Invalid token, access denied',
      msg: 'Invalid token, access denied'
    });
  }
};

module.exports = authMiddleware;
module.exports.extractToken = extractToken;
