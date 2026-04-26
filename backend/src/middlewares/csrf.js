/**
 * CSRF protection using the double-submit cookie pattern (csrf-csrf).
 *
 * Why:
 *   Cookie-based authentication (httpOnly auth cookie) is vulnerable to CSRF
 *   on state-changing requests. Header-based (`Authorization: Bearer`) clients
 *   are not, because an attacker cannot set arbitrary headers on cross-site
 *   requests.
 *
 * Strategy:
 *   - Clients call GET /api/csrf-token to obtain a CSRF token. The server
 *     sets a signed `x-csrf-token` cookie and returns the token in JSON.
 *   - On mutating requests (POST/PUT/PATCH/DELETE), clients must send the
 *     token back in the `X-CSRF-Token` header; csrf-csrf validates that
 *     header and cookie match.
 *   - CSRF is SKIPPED when the request authenticates via the Authorization
 *     header (not CSRF-vulnerable) or is fully unauthenticated (public
 *     endpoints).
 */

const { doubleCsrf } = require('csrf-csrf');
const logger = require('../utils/logger');

const CSRF_COOKIE_NAME = '__Host-numisroma.x-csrf-token';
// __Host- prefix requires secure + path=/ + no domain. Use a plain name
// in dev where secure=false is required for http://localhost.
const COOKIE_NAME_DEV = 'numisroma.x-csrf-token';

const getCsrfSecret = () => {
  const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'CSRF_SECRET (or JWT_SECRET as fallback) must be set in environment'
    );
  }
  return secret;
};

const isProd = () => process.env.NODE_ENV === 'production';

const {
  generateCsrfToken,
  doubleCsrfProtection,
  invalidCsrfTokenError
} = doubleCsrf({
  getSecret: getCsrfSecret,
  // csrf-csrf uses this to bind the token to a session identity. For our
  // stateless JWT setup we bind to the auth cookie value (if present) or
  // fall back to IP+UA so anonymous token flows still work.
  getSessionIdentifier: (req) => {
    if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }
    // Stable-ish anonymous fingerprint — not security-critical here because
    // unauthenticated requests don't hit CSRF-protected mutations anyway.
    return `${req.ip || 'unknown'}::${req.get('User-Agent') || 'unknown'}`;
  },
  cookieName: isProd() ? CSRF_COOKIE_NAME : COOKIE_NAME_DEV,
  cookieOptions: {
    httpOnly: true,
    secure: isProd(),
    sameSite: (process.env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase(),
    path: '/'
  },
  // The methods below are considered safe and not protected.
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  // Token is sent by the client in this header.
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  // Skip CSRF in cases where it isn't applicable.
  //
  // CSRF is enforced iff an auth cookie is present on the request. If there is
  // no cookie, the client is either using Authorization-header auth (not
  // CSRF-vulnerable) or is fully anonymous — in both cases there is no CSRF
  // surface to protect.
  //
  // This check runs BEFORE authMiddleware, so it must look at the raw cookie
  // rather than relying on req.authSource.
  skipCsrfProtection: (req) => {
    if (!req.cookies || !req.cookies.token) return true;
    return false;
  }
});

/**
 * Express error handler specifically for CSRF errors. Mount AFTER routes but
 * BEFORE the generic error handler so we can return a clean 403 with a
 * helpful code for the frontend to detect.
 */
const csrfErrorHandler = (err, req, res, next) => {
  if (err === invalidCsrfTokenError || err?.code === 'EBADCSRFTOKEN' || err?.code === 'ERR_BAD_CSRF_TOKEN') {
    logger.security.suspiciousActivity('CSRF token validation failed', {
      url: req.originalUrl,
      method: req.method,
      ip: req.ip
    });
    return res.status(403).json({
      error: 'Invalid CSRF token',
      code: 'CSRF_INVALID'
    });
  }
  return next(err);
};

/**
 * Route handler: issues a fresh CSRF token and sets the signed cookie.
 * Client stores the returned token (in memory, NOT localStorage) and sends
 * it in the `X-CSRF-Token` header on mutating requests.
 */
const csrfTokenHandler = (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
};

module.exports = {
  doubleCsrfProtection,
  csrfErrorHandler,
  csrfTokenHandler
};
