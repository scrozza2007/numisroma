/**
 * Centralized helpers for the httpOnly auth cookie.
 *
 * We use one cookie name ("token") across all auth endpoints to keep
 * set / clear behavior symmetric and to make the frontend integration
 * trivial (no cookie name per route).
 *
 * Security properties:
 *   - httpOnly: JS cannot read it → immune to localStorage-style XSS exfiltration.
 *   - secure:   required over HTTPS in production.
 *   - sameSite: 'lax' by default — protects against most CSRF while still
 *               permitting top-level navigation (useful for login redirects).
 *               Override to 'none' only when frontend is on a different
 *               cross-site origin and requires cross-site credentials.
 */

const AUTH_COOKIE_NAME = 'token';
const REFRESH_COOKIE_NAME = 'refreshToken';

// Auth cookie lifetime — 7 days. Used for both the simple 7-day JWT (POST /auth/login)
// and the short-lived access token from POST /auth/login-refresh (the cookie maxAge
// is intentionally longer than the JWT so the browser doesn't silently discard it;
// the JWT's own `exp` claim enforces the real expiry server-side).
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Refresh token cookie lifetime — 7 days, matching the refresh JWT expiry.
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getBaseCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase();

  const options = {
    httpOnly: true,
    secure: isProd,
    sameSite: ['lax', 'strict', 'none'].includes(sameSite) ? sameSite : 'lax',
    path: '/'
  };

  if (options.sameSite === 'none') {
    options.secure = true;
  }

  if (process.env.AUTH_COOKIE_DOMAIN) {
    options.domain = process.env.AUTH_COOKIE_DOMAIN;
  }

  return options;
};

const getAuthCookieOptions = () => ({
  ...getBaseCookieOptions(),
  maxAge: AUTH_COOKIE_MAX_AGE_MS
});

const getRefreshCookieOptions = () => ({
  ...getBaseCookieOptions(),
  maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  path: '/api/auth' // scope refresh cookie to auth endpoints only
});

const setAuthCookie = (res, token) => {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
};

const setRefreshCookie = (res, refreshToken) => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
};

const clearAuthCookie = (res) => {
  const { httpOnly, secure, sameSite, path, domain } = getAuthCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, { httpOnly, secure, sameSite, path, ...(domain && { domain }) });
};

const clearRefreshCookie = (res) => {
  const { httpOnly, secure, sameSite, domain } = getBaseCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly, secure, sameSite, path: '/api/auth', ...(domain && { domain })
  });
};

module.exports = {
  AUTH_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE_MAX_AGE_MS,
  getAuthCookieOptions,
  getRefreshCookieOptions,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  clearRefreshCookie
};
