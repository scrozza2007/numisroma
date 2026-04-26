const Session = require('../models/Session');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { extractToken } = require('../middlewares/authMiddleware');
const { hashToken } = require('../utils/tokenManager');
const logger = require('../utils/logger');

// Derive a compact device fingerprint (type / OS / browser) from a User-Agent.
const detectDevice = (userAgent) => {
  const ua = userAgent.toLowerCase();
  let deviceType = 'unknown';
  let os = 'unknown';
  let browser = 'unknown';
  let deviceName = 'Unknown device';

  // Device type
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|opera mini|opera mobi|webos/i.test(ua)) {
    deviceType = 'mobile';
  } else {
    deviceType = 'desktop';
  }

  // Operating system
  if (ua.includes('windows nt')) {
    os = 'Windows';
    if (ua.includes('windows nt 10')) os = 'Windows 10';
    else if (ua.includes('windows nt 6.3')) os = 'Windows 8.1';
    else if (ua.includes('windows nt 6.2')) os = 'Windows 8';
    else if (ua.includes('windows nt 6.1')) os = 'Windows 7';
    else if (ua.includes('windows nt 6.0')) os = 'Windows Vista';
    else if (ua.includes('windows nt 5.1')) os = 'Windows XP';
  } else if (ua.includes('mac os x')) {
    os = 'macOS';
    const macOSVersionMatch = ua.match(/mac os x (\d+_\d+)/);
    if (macOSVersionMatch) {
      const version = macOSVersionMatch[1].replace('_', '.');
      os += ` ${version}`;
    }
  } else if (ua.includes('android')) {
    os = 'Android';
    const androidVersionMatch = ua.match(/android (\d+(\.\d+)*)/);
    if (androidVersionMatch) {
      os += ` ${androidVersionMatch[1]}`;
    }
  } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    os = 'iOS';
    const iOSVersionMatch = ua.match(/os (\d+_\d+)/);
    if (iOSVersionMatch) {
      const version = iOSVersionMatch[1].replace('_', '.');
      os += ` ${version}`;
    }
  } else if (ua.includes('linux')) {
    os = 'Linux';
  }

  // Browser
  if (ua.includes('firefox/')) {
    browser = 'Firefox';
  } else if (ua.includes('edg/') || ua.includes('edge/')) {
    browser = 'Edge';
  } else if (ua.includes('opr/') || ua.includes('opera/')) {
    browser = 'Opera';
  } else if (ua.includes('chrome/') && !ua.includes('chromium/')) {
    browser = 'Chrome';
  } else if (ua.includes('safari/') && !ua.includes('chrome/') && !ua.includes('chromium/')) {
    browser = 'Safari';
  } else if (ua.includes('msie ') || ua.includes('trident/')) {
    browser = 'Internet Explorer';
  }

  // Human-readable device label for the UI
  deviceName = `${os} • ${browser}`;

  return {
    type: deviceType,
    operatingSystem: os,
    browser,
    deviceName
  };
};

// Resolve the best-effort client IP from an Express request.
// Prefers Express's `req.ip` (which honours `app.set('trust proxy')`),
// then falls back to raw socket addresses. This is defensive against
// malformed `x-forwarded-for` headers that we would otherwise store verbatim.
const resolveIp = (req) => {
  if (!req) return 'unknown';
  if (typeof req.ip === 'string' && req.ip.length > 0) return req.ip;
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    // `x-forwarded-for` may be a comma-separated list — first entry is the
    // original client. We only use this when trust-proxy is unset.
    return xff.split(',')[0].trim();
  }
  return (req.connection && req.connection.remoteAddress)
    || (req.socket && req.socket.remoteAddress)
    || 'unknown';
};

// Create a new session.
//
// SECURITY / RELIABILITY: this function MUST throw on persistence failure.
// Returning silently on a failed save would issue a signed JWT without a
// backing row in the `sessions` collection, causing `authMiddleware` to
// reject every subsequent request with 401. Callers (`registerUser` /
// `loginUser`) handle the thrown error by returning 500 and cleaning up
// any half-created user.
exports.createSession = async (userId, token, req) => {
  let deviceInfo;
  let ipAddress = 'unknown';
  let location = 'Unknown';

  if (req && typeof req === 'object') {
    const userAgent = req.headers ? (req.headers['user-agent'] || '') : '';
    deviceInfo = detectDevice(userAgent);
    ipAddress = resolveIp(req);
    if (req.body && typeof req.body.location === 'string') {
      location = req.body.location.trim().slice(0, 100);
    }
  } else {
    deviceInfo = {
      type: 'unknown',
      operatingSystem: 'unknown',
      browser: 'unknown',
      deviceName: 'Unknown Device'
    };
  }

  const session = new Session({
    userId,
    token: hashToken(token),
    deviceInfo,
    ipAddress,
    location,
    lastActive: new Date()
  });

  try {
    await session.save();
    return session;
  } catch (error) {
    logger.error('Failed to persist session', {
      userId: String(userId),
      error: error.message
    });
    // Rethrow: auth flow must not proceed with a token that has no session.
    throw error;
  }
};

// Get all active sessions for a user. Capped at 50 by default to keep
// response size bounded for accounts with long session histories. The
// query is always sorted by most-recent activity so the current session
// appears in the first page.
const MAX_SESSIONS_RETURNED = 50;

exports.getActiveSessions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || MAX_SESSIONS_RETURNED, 1),
      MAX_SESSIONS_RETURNED
    );

    const sessions = await Session.find({ userId, isActive: true })
      .sort({ lastActive: -1 })
      .limit(limit)
      .lean();

    // Extract the current token from either the httpOnly cookie or the
    // Authorization header. Using the shared helper handles both sources
    // safely, including the case where the caller has no token at all.
    const { token: currentToken } = extractToken(req);

    const sessionsWithCurrentFlag = sessions.map((session) => ({
      ...session,
      isCurrentSession: currentToken ? session.token === hashToken(currentToken) : false
    }));

    res.json({ sessions: sessionsWithCurrentFlag });
  } catch (error) {
    logger.error('Error retrieving active sessions', {
      error: error.message,
      userId: req.user?.userId
    });
    res.status(500).json({ error: 'Server error during sessions retrieval' });
  }
};

// Terminate a specific session.
// Atomic: we deactivate with a filtered `updateOne` rather than a
// read/mutate/save cycle so two concurrent terminate requests cannot race.
exports.terminateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    // Fetch token only to check the "can't terminate current session" rule.
    const session = await Session.findOne({ _id: sessionId, userId }).select('token');
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { token: currentToken } = extractToken(req);
    if (currentToken && session.token === hashToken(currentToken)) {
      return res.status(400).json({
        error: 'Cannot terminate current session from this endpoint',
        message: 'Use the logout endpoint to end the current session'
      });
    }

    await Session.updateOne(
      { _id: sessionId, userId },
      { $set: { isActive: false } }
    );

    res.json({ message: 'Session terminated successfully' });
  } catch (error) {
    logger.error('Error terminating session', {
      error: error.message,
      userId: req.user?.userId,
      sessionId: req.params?.sessionId
    });
    res.status(500).json({ error: 'Server error during session termination' });
  }
};

// Terminate all other sessions except current one
exports.terminateAllOtherSessions = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Extract current token from cookie or Authorization header. If the
    // caller has neither (shouldn't happen — authMiddleware required it —
    // but stay defensive) we refuse rather than terminate every session.
    const { token: currentToken } = extractToken(req);
    if (!currentToken) {
      return res.status(400).json({
        error: 'Current session token not found',
        message: 'Cannot identify current session to preserve'
      });
    }

    // Find and deactivate all other active user sessions
    await Session.updateMany(
      { userId, isActive: true, token: { $ne: hashToken(currentToken) } },
      { $set: { isActive: false } }
    );

    res.json({ message: 'All other sessions have been terminated successfully' });
  } catch (error) {
    logger.error('Error terminating other sessions', {
      error: error.message,
      userId: req.user?.userId
    });
    res.status(500).json({ error: 'Server error during sessions termination' });
  }
};

// Update last activity of a session. Best-effort: never throws to the caller,
// but logs failures at debug level so Mongo connectivity issues are still
// observable in the logs.
exports.updateSessionActivity = async (userId, token) => {
  try {
    await Session.updateOne(
      { userId, token, isActive: true },
      { $set: { lastActive: new Date() } }
    );
  } catch (error) {
    logger.debug('Failed to update session activity', {
      userId: String(userId),
      error: error.message
    });
  }
};
