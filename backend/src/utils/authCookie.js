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

// 7 days in ms, matches the current JWT expiresIn ('7d') used by loginUser/registerUser.
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getAuthCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase();

  const options = {
    httpOnly: true,
    secure: isProd, // browsers drop Secure cookies over plain HTTP in dev
    sameSite: ['lax', 'strict', 'none'].includes(sameSite) ? sameSite : 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_MS
  };

  // SameSite=None is only meaningful/allowed with Secure=true.
  if (options.sameSite === 'none') {
    options.secure = true;
  }

  // Optional explicit domain override (useful behind reverse proxies / subdomains).
  if (process.env.AUTH_COOKIE_DOMAIN) {
    options.domain = process.env.AUTH_COOKIE_DOMAIN;
  }

  return options;
};

const setAuthCookie = (res, token) => {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
};

const clearAuthCookie = (res) => {
  // Must match path/domain used when setting the cookie, or the browser
  // won't delete it.
  const { httpOnly, secure, sameSite, path, domain } = getAuthCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, { httpOnly, secure, sameSite, path, ...(domain && { domain }) });
};

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
  getAuthCookieOptions,
  setAuthCookie,
  clearAuthCookie
};
